/**
 * Runs one hands-free deck on the web (docs/specs/COMPANION-HANDS-FREE.md §9.3) on the shared
 * reducer (shared/hands-free/deck.ts), the web twin of the app's useHandsFreeDeck. The reducer
 * owns every rule; this hook connects it to the browser:
 *
 * - **Timers:** the one timer the reducer asks for (`deckTimer`) is scheduled and sent back.
 * - **Microphone:** the speech source starts and stops as `deckMic` says, tagged with its
 *   session, so late words never reach another card. The page being hidden pauses the deck (which
 *   turns the microphone off); leaving the page stops it. When OpenAI fails during the deck (the
 *   socket will not open, no fresh key), the browser's speech recognition takes over once.
 * - **Live words:** each `onText` goes to the reducer, which ticks chips with `coverLocally` at once.
 * - **Pauses:** when the deck starts Checking, the source is told to commit (OpenAI finishes the
 *   turn) and, when the reducer asks (`deckServerCheck`), /team/coverage runs, raced with 2.5 s;
 *   its ids are merged with the local result and kept to the card's own hints. Nudges always come
 *   from the hint table.
 * - **Connection:** navigator.onLine and its events.
 * - **Level:** kept in a ref for the caption box's bars (no re-render ten times a second).
 */
import { useEffect, useReducer, useRef, useState, useSyncExternalStore } from "react";
import {
  DECK_TIMING,
  createDeck,
  deckMic,
  deckReducer,
  deckServerCheck,
  deckText,
  deckTimer,
  type DeckMode,
  type DeckState,
} from "../../../shared/hands-free/deck.ts";
import { coverLocally, mergeCoverage } from "../../../shared/hands-free/coverage.ts";
import type { CardAnswer, HandsFreeQuestion, QuestionKey } from "../../../shared/hands-free/types.ts";
import { PartRecorder, recordingType, type BackupQueue, type BackupView } from "./backup.ts";
import { sameWords } from "./flow-model.ts";
import type { SpeechSource, SpeechSourceError, SpeechSourceKind } from "./speech/types.ts";

/** Where the deck's timers come from. Tests pass a manual clock. */
export interface DeckClock {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}
export const realClock: DeckClock = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

/** Why the microphone is off for good in this run: the note above the typing box. */
export type MicBlock = "permission" | "unavailable" | null;

export type WebHandsFreeDeckOptions = {
  questions: HandsFreeQuestion[];
  mode: DeckMode;
  /** The microphone was refused (or is missing) before starting: typing with the note. */
  micBlocked?: MicBlock;
  /** A saved draft: the deck starts at the first unanswered card. */
  answers?: (CardAnswer | null)[];
  /**
   * Makes the speech source, once, the first time the microphone turns on; again with "browser"
   * when OpenAI fails during the deck. Absent: no voice (preview).
   */
  speech?: (preferred?: SpeechSourceKind) => Promise<SpeechSource>;
  /** The microphone chosen on the consent screen. */
  deviceId?: string;
  /** The server's "is this enough?" check; resolves to hint ids, or null when unavailable. Absent: local only. */
  checkCoverage?: (questionKey: QuestionKey, text: string) => Promise<string[] | null>;
  clock?: DeckClock;
  /** Every change of the answers or the mode (save it as the draft). */
  onAnswers?: (answers: (CardAnswer | null)[], mode: DeckMode) => void;
  /** Every card is done: go to "Here's what we heard". */
  onDone?: (answers: (CardAnswer | null)[]) => void;
  /** The recorded backup (backup.ts): spoken cards are recorded and sent here when live words drop out. */
  backup?: BackupQueue;
};

/**
 * Whether the deck still wants its microphone running, also between cards (Got it, the next card
 * appearing, a nudge, the skip sheet, a past card being read) and while typing (October 19: back to
 * voice after typing a few words then needs no restart, which phones answer with a deaf recognizer;
 * words said while typing are dropped and nothing is recorded): not paused, no error, not blocked,
 * not at the review. It never starts a microphone by itself; only a listening card does.
 */
export function keepMic(s: DeckState): boolean {
  return !s.micBlocked && !s.paused && !s.speechError && s.phase !== "done";
}

/** Whether the current card's recording runs (voice, on the card, not paused); it pauses otherwise. */
export function recordNow(s: DeckState): boolean {
  return s.mode === "voice" && !s.paused && s.view == null && !s.micBlocked && s.phase !== "done" && !s.answers[s.idx];
}

/** Watchdog: this long of sound with no words while a card listens restarts the recognizer. */
export const WATCHDOG_MS = 6000;
/** The level (0 to 1) that counts as someone talking for the watchdog. */
export const WATCHDOG_LEVEL = 0.12;
/** A part whose loudest moment (while live words were down) stayed under talking level is not sent. */
export const BACKUP_SPEECH_LEVEL = WATCHDOG_LEVEL;

const online = () => (typeof navigator === "undefined" ? true : navigator.onLine !== false);
const noBackup: BackupView = { clips: [], results: [], remaining: null, online: true };
const noSubscribe = () => () => {};

export function useWebHandsFreeDeck(o: WebHandsFreeDeckOptions) {
  const clock = o.clock ?? realClock;
  const [micBlock, setMicBlock] = useState<MicBlock>(o.micBlocked ?? null);
  const [speechKind, setSpeechKind] = useState<SpeechSourceKind | null>(o.speech ? null : "none");
  const [state, dispatch] = useReducer(deckReducer, undefined, () =>
    createDeck(o.questions, { mode: o.mode, micBlocked: !!o.micBlocked, serverCheck: !!o.checkCoverage, offline: !online(), answers: o.answers }),
  );
  const latest = useRef(o);
  latest.current = o;
  const stateRef = useRef(state);
  stateRef.current = state;
  const level = useRef(0);
  const readLevel = useRef(() => level.current).current;

  // Timers: the one the reducer wants, by id.
  const timer = deckTimer(state);
  useEffect(() => {
    if (!timer) return;
    const id = timer.id;
    const h = clock.set(() => dispatch({ type: "timer", id }), timer.ms);
    return () => clock.clear(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer?.id]);

  // Mounted: nothing starts a microphone once the deck is gone (a key request can outlive it).
  const alive = useRef(true);

  // The speech source, made once and only when the microphone first turns on (the OpenAI source asks
  // the server for a key when it is made).
  const source = useRef<Promise<SpeechSource | null> | null>(null);
  const fellBack = useRef(false);
  const getSource = () => {
    if (!source.current) {
      const make = latest.current.speech;
      source.current = make
        ? make().then(
            (s) => {
              setSpeechKind(s.kind);
              return s;
            },
            () => null,
          )
        : Promise.resolve(null);
    }
    return source.current;
  };
  const micWanted = (session: number) => alive.current && stateRef.current.session === session && deckMic(stateRef.current).on;

  // Microphone (October 19): ONE source runs for the whole deck. Restarting the microphone and the
  // recognizer at every card left phones (with or without Bluetooth earbuds) deaf after card 1, so a
  // new card only resets the words (`reset`). The source stops only when the deck no longer wants a
  // microphone at all (`keepMic`): paused, typing, an error, the review, or leaving the page. Words go
  // to the reducer only while the card is listening (`deckMic`), tagged with the current session.
  const mic = deckMic(state);
  const micKey = mic.on ? mic.session : -1;
  const keep = keepMic(state);
  const lastText = useRef("");
  /** Words an earlier source (or an earlier start) heard in this session, kept across a restart. */
  const prefix = useRef("");
  /** The session words go to; -1 while no card is listening. */
  const sessionRef = useRef(-1);
  /** The source that is running now, or null. */
  const running = useRef<SpeechSource | null>(null);
  /** After an audio route change: the default microphone from then on. */
  const defaultMic = useRef(false);
  /** Restarts in the current session (route changes and the watchdog), so a broken device cannot loop. */
  const restarts = useRef<{ session: number; n: number }>({ session: -1, n: 0 });
  /** Watchdog: when words last came, and since when sound has been heard without words. */
  const lastWordsAt = useRef(0);
  const soundSince = useRef(0);

  // The recorded backup (backup.ts). One part at a time, on the running source's stream, for the
  // current card. `troubleNow`: live words are down right now (the source said so, the watchdog
  // fired or the browser went offline); every part recorded meanwhile is sent.
  const streamRef = useRef<MediaStream | null>(null);
  const [streamTick, setStreamTick] = useState(0);
  /** `peak`: the loudest moment while live words were down; a part is sent only when someone talked then. */
  type Part = { rec: PartRecorder; stream: MediaStream; idx: number; key: QuestionKey; start: string; trouble: boolean; peak: number; heard: number };
  const part = useRef<Part | null>(null);
  const troubleNow = useRef(false);
  /** The source says live words are down (onTrouble). */
  const sourceDown = useRef(false);
  const [trouble, setTrouble] = useState(false);
  const [partMs, setPartMs] = useState(0);
  const recType = useRef<string | null>(null);
  /** The watchdog gave up on this session; the source keeps running for the recording. */
  const watchdogOff = useRef(-1);

  /**
   * Live words are down from now. `missed`: words were probably lost already (the watchdog heard
   * talking with no words, the source failed mid-answer), so the part is sent even if nobody talks after.
   */
  const flagTrouble = (missed = false) => {
    troubleNow.current = true;
    const p = part.current;
    if (p) {
      p.trouble = true;
      if (missed) p.peak = Math.max(p.peak, p.heard);
    }
    setTrouble(true);
  };
  const clearTrouble = () => {
    troubleNow.current = false;
    setTrouble(false);
  };
  const startPart = () => {
    const b = latest.current.backup;
    const st = stateRef.current;
    const stream = streamRef.current;
    if (!b || !stream || part.current || !recordNow(st)) return;
    if (recType.current == null) recType.current = recordingType();
    if (!recType.current) return;
    try {
      const rec = new PartRecorder(stream, recType.current, () => {
        // At the size or time limit: this part ends and the next one starts at once.
        const was = !!part.current?.trouble;
        endPart();
        startPart();
        if (part.current && (was || troubleNow.current)) part.current.trouble = true;
      });
      const q = st.questions[st.idx];
      part.current = { rec, stream, idx: st.idx, key: q.key, start: deckText(st), trouble: troubleNow.current, peak: 0, heard: 0 };
    } catch {
      /* This browser cannot record this stream: live words only. */
    }
  };
  const endPart = () => {
    const p = part.current;
    if (!p) return;
    part.current = null;
    setPartMs(0);
    const st = stateRef.current;
    const answer = st.answers[p.idx];
    const end = answer?.raw ?? (st.idx === p.idx ? deckText(st) : "");
    const replace = end.startsWith(p.start) ? end.slice(p.start.length).trim() : "";
    const keep = p.trouble && p.peak >= BACKUP_SPEECH_LEVEL && answer?.status !== "skipped";
    const ms = p.rec.ms;
    void p.rec.stop().then((blob) => {
      if (keep && blob) latest.current.backup?.add({ idx: p.idx, key: p.key, replace, before: p.start, blob, ms });
    });
  };

  const stopRunning = () => {
    const s = running.current;
    running.current = null;
    level.current = 0;
    soundSince.current = 0;
    if (s) void s.stop();
  };

  /** One more restart in this session? At most 3; then the card shows Try again. */
  const mayRestart = () => {
    const session = sessionRef.current;
    const r = restarts.current.session === session ? restarts.current : { session, n: 0 };
    restarts.current = { session, n: r.n + 1 };
    return r.n < 3;
  };

  /** Starts `s`, keeping the words of this session heard so far (a restart within a card). */
  const startSource = (s: SpeechSource) => {
    running.current = s;
    prefix.current = lastText.current;
    lastWordsAt.current = Date.now();
    soundSince.current = 0;
    const report = (e: SpeechSourceError) => {
      if (e.code === "permission_denied") setMicBlock("permission");
      if (e.code === "not_available") setMicBlock("unavailable");
      dispatch({ type: "speechError", code: e.code === "device_changed" ? "other" : e.code, session: sessionRef.current });
    };
    const onError = (e: SpeechSourceError) => {
      if (!alive.current || running.current !== s) return;
      running.current = null;
      level.current = 0;
      // Whatever was recorded around this error is sent (its live words may be missing).
      if (e.code !== "permission_denied" && e.code !== "not_available") flagTrouble(true);
      // Earbuds connected or dropped (October 18): restart on the default microphone, keeping the words.
      if (e.code === "device_changed") {
        defaultMic.current = true;
        if (mayRestart() && keepMic(stateRef.current)) return startSource(s);
        return report({ code: "other", message: "microphone changed" });
      }
      // OpenAI did not work here (no socket, no fresh key, the audio graph): the browser's speech
      // recognition is next (spec §9.1), once per deck, keeping the words of this session.
      if (s.kind === "openai" && e.code !== "permission_denied" && !fellBack.current) {
        fellBack.current = true;
        const make = latest.current.speech;
        const next = (make ? make("browser") : Promise.resolve(null)).catch(() => null);
        source.current = next.then((b) => (b && b.kind !== "none" ? b : s));
        void next.then((b) => {
          if (!alive.current) return;
          if (!b || b.kind === "none") return report(e);
          setSpeechKind(b.kind);
          if (keepMic(stateRef.current)) startSource(b);
        });
        return;
      }
      report(e);
    };
    void s
      .start(
        {
          lang: (typeof navigator !== "undefined" && navigator.language) || "en-US",
          deviceId: defaultMic.current ? undefined : latest.current.deviceId || undefined,
        },
        {
          onText: (words) => {
            if (running.current !== s) return;
            const st = stateRef.current;
            const session = sessionRef.current;
            // Between cards (Got it, the next card appearing) the words have no card: drop them.
            if (session < 0 || st.session !== session || !deckMic(st).on) return;
            lastWordsAt.current = Date.now();
            soundSince.current = 0;
            // Words again (after a watchdog restart, say): live words are back; this part stays marked.
            if (words.trim() && !sourceDown.current) clearTrouble();
            // A tidier copy of the same words (OpenAI's completed turn) does not reopen a card that is checking.
            const text = [prefix.current, words.trim()].filter(Boolean).join(" ");
            const same = sameWords(text, lastText.current);
            lastText.current = text;
            if (same && st.phase !== "listening") return;
            dispatch({ type: "speech", session, text, via: s.kind === "openai" ? "voice_openai" : "voice_browser" });
          },
          onLevel: (l) => {
            if (running.current !== s) return;
            level.current = deckMic(stateRef.current).on ? l : 0;
            const pt = part.current;
            if (pt && !pt.rec.paused) {
              if (l > pt.heard) pt.heard = l;
              if (troubleNow.current && l > pt.peak) pt.peak = l;
            }
            watchdog(s, l);
          },
          onError,
          onStream: (stream) => {
            if (!alive.current) return;
            if (stream) {
              if (running.current !== s) return;
              streamRef.current = stream;
              setStreamTick((n) => n + 1);
              return;
            }
            const was = streamRef.current;
            if (part.current?.stream === was || !was) {
              // Stop recording now, while the tracks still run, so the last second is kept; decide
              // whether to keep it after the source's own error handler (it may mark the trouble).
              if (part.current) void part.current.rec.stop();
              setTimeout(() => {
                if (part.current && part.current.stream === was) endPart();
              }, 0);
            }
            if (streamRef.current === was) streamRef.current = null;
          },
          onTrouble: (down) => {
            if (running.current !== s) return;
            sourceDown.current = down;
            if (down) flagTrouble();
            else {
              clearTrouble();
              lastWordsAt.current = Date.now();
            }
          },
        },
      )
      .catch(() => onError({ code: "other" }));
  };

  /**
   * The recognizer can die silently on a phone (no error, no words) while the microphone still
   * hears the person. Sound for WATCHDOG_MS with no words while a card listens: restart the source,
   * keeping the words (at most 3 times a card; then Try again).
   */
  const watchdog = (s: SpeechSource, l: number) => {
    const st = stateRef.current;
    if (!deckMic(st).on || st.phase !== "listening") {
      soundSince.current = 0;
      return;
    }
    // The source is already retrying (no signal), or the watchdog gave up on this card.
    if (troubleNow.current || watchdogOff.current === sessionRef.current) return;
    const now = Date.now();
    if (l < WATCHDOG_LEVEL) return;
    if (!soundSince.current || soundSince.current < lastWordsAt.current) soundSince.current = now;
    if (now - soundSince.current < WATCHDOG_MS) return;
    soundSince.current = 0;
    if (running.current !== s) return;
    running.current = null;
    // What this part recorded is sent: the person talked and no words came.
    if (part.current) {
      part.current.trouble = true;
      part.current.peak = Math.max(part.current.peak, part.current.heard);
    }
    setTrouble(true);
    void s.stop().then(() => {
      if (!alive.current || !keepMic(stateRef.current) || running.current) return;
      if (mayRestart()) return startSource(s);
      // Out of restarts. With the recording, keep the microphone running for it (no more restarts
      // on this card); without one, Try again.
      if (latest.current.backup && recType.current) {
        watchdogOff.current = sessionRef.current;
        troubleNow.current = true;
        return startSource(s);
      }
      dispatch({ type: "speechError", code: "other", session: sessionRef.current });
    });
  };

  // A new card listening: route words to its session; start the source once, or only reset it.
  useEffect(() => {
    if (!mic.on) {
      sessionRef.current = -1;
      level.current = 0;
      return;
    }
    const session = mic.session;
    sessionRef.current = session;
    lastText.current = "";
    prefix.current = "";
    lastWordsAt.current = Date.now();
    soundSince.current = 0;
    if (running.current) {
      running.current.reset();
      return;
    }
    void getSource().then((s) => {
      if (!micWanted(session) || running.current) return;
      if (!s) {
        setMicBlock("unavailable");
        return dispatch({ type: "speechError", code: "not_available", session });
      }
      startSource(s);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [micKey]);

  // The deck no longer wants a microphone (paused, typing, an error, the review): stop it.
  useEffect(() => {
    if (!keep) stopRunning();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keep]);

  // On each pause the source finishes the turn (OpenAI: input_audio_buffer.commit).
  const checking = state.phase === "checking" && state.check ? state.check.id : null;
  useEffect(() => {
    if (checking == null || !source.current) return;
    void source.current.then((s) => s?.commit());
  }, [checking]);

  // Leaving: release the microphone. A hidden page pauses the deck (the person resumes it).
  useEffect(() => {
    alive.current = true;
    const hide = () => {
      if (document.visibilityState === "hidden") dispatch({ type: "pause" });
    };
    const leave = () => {
      stopRunning();
      if (source.current) void source.current.then((s) => s?.stop());
    };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", leave);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", leave);
      alive.current = false;
      leave();
    };
  }, []);

  // The server check, raced with the most the deck waits for it.
  const check = deckServerCheck(state);
  useEffect(() => {
    if (!check) return;
    const ask = latest.current.checkCoverage;
    const { checkId, questionKey, text } = check;
    const hints = stateRef.current.questions[stateRef.current.idx]?.hints ?? [];
    let settled = false;
    const finish = (covered: string[] | null) => {
      if (settled) return;
      settled = true;
      clock.clear(h);
      dispatch({ type: "serverCoverage", checkId, covered });
    };
    const h = clock.set(() => finish(null), DECK_TIMING.serverWaitMax);
    if (!ask) finish(null);
    else
      ask(questionKey, text)
        .then((ids) => finish(ids ? mergeCoverage(coverLocally(text, hints), ids, hints).covered : null))
        .catch(() => finish(null));
    return () => {
      settled = true;
      clock.clear(h);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [check?.checkId]);

  // The recording follows the card: a part starts when a card listens in voice (on the running
  // source's stream), pauses while typing, paused or reading a past card, and ends with the card.
  useEffect(() => {
    const p = part.current;
    const st = stateRef.current;
    if (p && (p.idx !== st.idx || st.answers[p.idx] || st.phase === "done" || !streamRef.current)) endPart();
    const q = part.current;
    if (q) {
      if (recordNow(st)) q.rec.resume();
      else q.rec.pause();
    } else startPart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.idx, state.answers, state.mode, state.paused, state.view, state.phase, streamTick]);

  // A new card starts without trouble unless live words are still down (no signal).
  useEffect(() => {
    troubleNow.current = sourceDown.current || !online();
    setTrouble(troubleNow.current);
  }, [state.idx]);

  // Once a second: the part's time limit and the time shown on the card.
  useEffect(() => {
    const t = setInterval(() => {
      const p = part.current;
      if (!p) return;
      p.rec.tick();
      setPartMs(p.rec.ms);
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // Texts of recordings go into their answers once the card is answered (or the deck is done).
  const backup = o.backup;
  const backupView = useSyncExternalStore(backup?.subscribe ?? noSubscribe, backup?.getView ?? (() => noBackup));
  useEffect(() => {
    if (!backup) return;
    const st = stateRef.current;
    for (const r of backupView.results) {
      if (st.phase !== "done" && r.idx === st.idx && !st.answers[r.idx]) continue;
      dispatch({ type: "recorded", idx: r.idx, replace: r.replace, before: r.before, text: r.text, via: r.via });
      backup.consume(r.id);
    }
  }, [backup, backupView, state.answers, state.phase, state.idx]);

  // Leaving with a part running: it ends (and is kept when it had trouble).
  useEffect(() => () => endPart(), []);

  // Connection.
  useEffect(() => {
    const on = () => dispatch({ type: "online", online: true });
    const off = () => {
      dispatch({ type: "online", online: false });
      // No signal: the live words stop; the recording keeps the answer.
      flagTrouble();
    };
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // Answers and mode to the caller (the draft); the end of the deck.
  useEffect(() => {
    latest.current.onAnswers?.(state.answers, state.mode);
  }, [state.answers, state.mode]);
  const done = state.phase === "done";
  useEffect(() => {
    if (done) latest.current.onDone?.(state.answers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  return {
    state,
    send: dispatch,
    micBlock,
    speechKind,
    level: readLevel,
    /** The recorded backup for the card on screen: whether it records, live words are down, its time. */
    backup: { view: backupView, recording: !!part.current && !part.current.rec.paused, trouble, partMs, enabled: !!backup },
  };
}

export type { DeckState };
