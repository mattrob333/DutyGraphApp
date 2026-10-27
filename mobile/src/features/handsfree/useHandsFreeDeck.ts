/**
 * Runs one hands-free deck (docs/specs/COMPANION-HANDS-FREE.md §6.2) on the shared reducer
 * (`@shared/hands-free/deck`). The reducer owns every rule; this hook only connects it to the
 * world:
 *
 * - **Timers:** the one timer the reducer asks for (`deckTimer`) is scheduled and sent back.
 * - **Microphone:** live speech starts and stops as `deckMic` says, tagged with its session, so
 *   late words can never reach another card. It also stops on blur, background and unmount (the
 *   deck pauses, and the person resumes it).
 * - **Coverage:** the reducer ticks chips from the words with `coverLocally` as they arrive. When
 *   it asks (`deckServerCheck`), the server check runs, raced with a 2.5 s limit; whatever comes
 *   back is merged with the local result and filtered to the card's own hints. Nudges always come
 *   from the hint table, never from model text.
 * - **Announcements** go to VoiceOver / TalkBack; **answers** are handed to the caller (draft).
 */
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { AccessibilityInfo, AppState, Platform } from "react-native";
import { useFocusEffect } from "expo-router";
import {
  DECK_TIMING,
  createDeck,
  deckMic,
  deckReducer,
  deckServerCheck,
  deckTimer,
  deckVoice,
  type DeckMode,
  type DeckState,
} from "@shared/hands-free/deck";
import { coverLocally, mergeCoverage } from "@shared/hands-free/coverage";
import type { CompanionRepository } from "@/api/repository";
import type { CardBackup } from "@/features/voice/cardBackup";
import type { VoiceOut } from "@/features/voice/out";
import type { LiveSpeech, LiveSpeechError } from "@/features/voice/live";
import { useUiStore } from "@/state/ui";
import type { CardAnswer, QuestionSet } from "@/types/handsfree";

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

export interface HandsFreeDeckOptions {
  set: QuestionSet;
  mode: DeckMode;
  /** A saved draft: the deck starts at the first unanswered card. */
  answers?: (CardAnswer | null)[];
  speech: LiveSpeech;
  voiceOut?: VoiceOut;
  backup?: CardBackup | null;
  speak?: boolean;
  autoAdvance?: boolean;
  followUps?: "table" | "ai";
  repo: Pick<CompanionRepository, "checkCoverage">;
  /** The microphone is known to be blocked before starting (typing with the note). */
  micBlock?: MicBlock;
  clock?: DeckClock;
  lang?: string;
  /** Every change of the answers or the mode (save it as the draft). */
  onAnswers?: (answers: (CardAnswer | null)[], mode: DeckMode) => void;
  /** Every card is done: go to "Here's what we heard". */
  onDone?: (answers: (CardAnswer | null)[]) => void;
}

export function useHandsFreeDeck(o: HandsFreeDeckOptions) {
  const clock = o.clock ?? realClock;
  const offline = useUiStore((s) => s.offline);
  const [micBlock, setMicBlock] = useState<MicBlock>(o.micBlock ?? null);
  const [state, dispatch] = useReducer(deckReducer, undefined, () =>
    createDeck(o.set.questions, {
      mode: o.mode,
      micBlocked: !!o.micBlock,
      serverCheck: true,
      offline,
      answers: o.answers,
      speak: o.speak ?? false,
      autoAdvance: o.autoAdvance ?? false,
      followUps: o.followUps ?? "table",
    }),
  );
  const alive = useRef(true);
  const latest = useRef(o);
  latest.current = o;

  // Timers: the one the reducer wants, by id.
  const timer = deckTimer(state);
  useEffect(() => {
    if (!timer) return;
    const id = timer.id;
    const h = clock.set(() => dispatch({ type: "timer", id }), timer.ms);
    return () => clock.clear(h);

  }, [timer?.id]);

  // A physical microphone stays open across cards; callbacks read the current session.
  const mic = deckMic(state);
  const micOn =
    mic.on && !(o.speech.kind === "simulated" && state.phase === "speaking");
  const currentState = useRef(state);
  currentState.current = state;
  const currentMic = useRef(mic);
  currentMic.current = mic;
  const queue = useRef<Promise<void>>(Promise.resolve());
  const started = useRef(false);
  const backupFailed = useRef(false);
  const loudSince = useRef<number | null>(null);
  const previousWords = useRef(0);
  useEffect(() => {
    const speech = latest.current.speech;
    const backup = latest.current.backup;
    const on = micOn;
    queue.current = queue.current
      .catch(() => {})
      .then(async () => {
        await backup?.finish(backupFailed.current).catch(() => {});
        backupFailed.current = false;
        if (!on || !alive.current) {
          started.current = false;
          await speech.stop().catch(() => {});
          return;
        }
        const options = {
          lang: latest.current.lang ?? "en-US",
          script: currentMic.current.script ?? undefined,
        };
        const questionKey =
          currentState.current.questions[currentState.current.idx]?.key;
        if (questionKey)
          await backup
            ?.start({ questionKey, session: currentMic.current.session })
            .catch(() => {});
        previousWords.current = 0;
        loudSince.current = null;
        // Simulated speech needs a new script; native reset only clears the text accumulator.
        if (started.current && speech.reset && speech.kind !== "simulated") {
          await speech.reset(options);
          return;
        }
        await speech.stop().catch(() => {});
        const onError = (e: LiveSpeechError) => {
          backupFailed.current = true;
          if (e.code === "permission_denied") setMicBlock("permission");
          if (e.code === "not_available") setMicBlock("unavailable");
          dispatch({
            type: "speechError",
            code: e.code,
            session: currentMic.current.session,
          });
        };
        try {
          await speech.start(options, {
            onText: (text) => {
              if (!currentMic.current.on) return;
              const words = text.trim().split(/\s+/).filter(Boolean).length;
              if (currentState.current.phase === "speaking") {
                if (
                  speech.kind !== "simulated" &&
                  words - previousWords.current >= 2
                )
                  dispatch({ type: "bargeIn" });
                previousWords.current = words;
                return;
              }
              dispatch({
                type: "speech",
                session: currentMic.current.session,
                text,
                via: speech.source ?? "voice_device",
              });
            },
            onLevel: (level) => {
              if (currentState.current.phase !== "speaking" || level < 0.03) {
                loudSince.current = null;
                return;
              }
              loudSince.current ??= Date.now();
              if (Date.now() - loudSince.current >= 300) {
                loudSince.current = null;
                dispatch({ type: "bargeIn" });
              }
            },
            onPause: () => {
              speech.commit?.();
              dispatch({
                type: "speechEnd",
                session: currentMic.current.session,
              });
            },
            onError,
          });
          started.current = true;
        } catch {
          onError({ code: "other" });
        }
      });
  }, [micOn, mic.session]);

  const voice = deckVoice(state);
  useEffect(() => {
    const output = latest.current.voiceOut;
    if (!output) return;
    let active = true;
    const unsubscribe = output.subscribe((event) => {
      if (!active || event.lineId !== voice?.lineId) return;
      dispatch({
        type:
          event.type === "start"
            ? "speechOutStart"
            : event.type === "end"
              ? "speechOutEnd"
              : "speechOutError",
        lineId: event.lineId,
      });
    });
    if (voice) {
      void (async () => {
        const reader = await AccessibilityInfo.isScreenReaderEnabled().catch(
          () => false,
        );
        if (!active) return;
        // Screen readers own status lines; questions can still be played explicitly.
        if (reader && voice.kind !== "question") {
          dispatch({ type: "speechOutEnd", lineId: voice.lineId });
          return;
        }
        await output.prepare([{ id: voice.lineId, text: voice.text }]);
        if (active) await output.play(voice.lineId);
      })().catch(() => {
        if (active) dispatch({ type: "speechOutError", lineId: voice.lineId });
      });
    } else output.stop();
    return () => {
      active = false;
      unsubscribe();
      output.stop();
    };
  }, [voice?.lineId]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      const speech = latest.current.speech;
      queue.current = queue.current
        .catch(() => {})
        .then(async () => {
          await speech.stop().catch(() => {});
          await latest.current.backup
            ?.finish(backupFailed.current)
            .catch(() => {});
        });
    };
  }, []);

  // Leaving the screen or the app pauses the deck, which turns the microphone off.
  useFocusEffect(useCallback(() => () => dispatch({ type: "pause" }), []));
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s !== "active") dispatch({ type: "pause" });
    });
    return () => sub.remove();
  }, []);

  // The server check, raced with the most the deck waits for it.
  const check = deckServerCheck(state);
  useEffect(() => {
    if (!check) return;
    const { checkId, questionKey, text } = check;
    const hints = state.questions[state.idx]?.hints ?? [];
    let settled = false;
    const finish = (
      covered: string[] | null,
      followUp?: { text: string; hintId: string },
    ) => {
      if (settled) return;
      settled = true;
      clock.clear(h);
      dispatch({ type: "serverCoverage", checkId, covered, followUp });
    };
    const h = clock.set(() => finish(null), DECK_TIMING.serverWaitMax);
    latest.current.repo
      .checkCoverage({
        requestId: latest.current.set.requestId,
        questionKey,
        text,
      })
      .then((r) =>
        finish(
          r.available
            ? mergeCoverage(coverLocally(text, hints), r.result.covered, hints)
                .covered
            : null,
          r.available
            ? (
                r.result as typeof r.result & {
                  followUp?: { text: string; hintId: string };
                }
              ).followUp
            : undefined,
        ),
      )
      .catch(() => finish(null));
    return () => {
      settled = true;
      clock.clear(h);
    };

  }, [check?.checkId]);

  useEffect(() => {
    if (offline || !o.backup) return;
    void o.backup
      .flush(
        (clip, text) => {
          const idx = currentState.current.questions.findIndex(
            (question) => question.key === clip.questionKey,
          );
          dispatch({
            type: "recorded",
            idx,
            replace: currentState.current.answers[idx]?.raw ?? "",
            text,
            via: latest.current.speech.source ?? "voice_device",
          });
        },
        (clip) =>
          currentState.current.questions.some(
            (question, idx) =>
              question.key === clip.questionKey &&
              !!currentState.current.answers[idx],
          ),
      )
      .catch(() => {});
  }, [offline, state.answers, o.backup]);

  // Connection.
  useEffect(() => {
    dispatch({ type: "online", online: !offline });
  }, [offline]);

  // Screen readers hear each new announcement (web: the live region on the screen).
  useEffect(() => {
    if (!state.announceId || !state.announce || Platform.OS === "web") return;
    AccessibilityInfo.announceForAccessibility(state.announce);
  }, [state.announceId, state.announce]);

  // Answers and mode to the caller (the draft); the end of the deck.
  useEffect(() => {
    latest.current.onAnswers?.(state.answers, state.mode);
  }, [state.answers, state.mode]);
  const done = state.phase === "done";
  useEffect(() => {
    if (done) latest.current.onDone?.(state.answers);

  }, [done]);

  return {
    state,
    send: dispatch,
    micBlock,
    replay: () => dispatch({ type: "replayQuestion" }),
  };
}

export type { DeckState };
