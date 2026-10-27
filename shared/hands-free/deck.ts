/**
 * One hands-free deck run as a pure reducer (docs/specs/COMPANION-HANDS-FREE.md §2–3). It follows
 * the prototype's `hf*` state machine (docs/design/companion-mobile/DutyGraph_Companion_2.dc.html)
 * with its timings, but owns no clocks, microphones or network calls:
 *
 * - **Timers are events.** The state holds at most one pending timer (`state.timer`, or
 *   `deckTimer(state)`). The caller schedules it when its `id` changes, cancels the old one, and
 *   sends `{ type: "timer", id }` when it fires. A stale id is ignored.
 * - **The microphone follows the state.** `deckMic(state)` says whether it should be on and which
 *   `session` it belongs to. When the session number changes, stop and start again; send speech as
 *   `{ type: "speech", session, text }` with the full text heard since that start. Words from an
 *   old session are ignored, so a late recognizer callback cannot reach the wrong card.
 * - **The server check is optional.** With `serverCheck: true`, `deckServerCheck(state)` names a
 *   check to run while the card shows Checking; send `{ type: "serverCoverage", checkId, covered }`
 *   (covered `null` when unavailable). The deck waits at most `DECK_TIMING.serverWaitMax` in all.
 * - **Announcements are state.** `announce` changes with `announceId`; read it out on each new id.
 */
import { coverLocally, spokenSkip, wholeSkip } from "./coverage";
import { applyRecorded } from "./recorded";
import type { CardAnswer, CardInput, HandsFreeQuestion, HandsFreeVoiceVia, SkipReason } from "./types";

/** The prototype's timings in ms. Resume values apply after Pause, the skip sheet or a past card. */
export const DECK_TIMING = {
  /** Card shown → microphone listening. */
  cardToListen: 1300,
  /** Extra time after the estimated spoken line duration. */
  speakFallback: 1500,
  autoAdvance: 3000,
  /** Words stop → check starts. */
  pauseToCheck: 900,
  /** No new words at all → check anyway. */
  silenceToCheck: 3200,
  /** The same on "Anything else?"; with nothing said the deck goes to the review. */
  elseSilence: 5000,
  /** Checking is shown at least this long. */
  checkingMin: 750,
  /** The most the deck waits for the server check, counted from the start of Checking. */
  serverWaitMax: 2500,
  /** "A bit more" → listening again. */
  moreToListen: 1600,
  /** Got it hold (Keep talking visible). */
  gotHold: 1300,
  savedHold: 1500,
  skippedHold: 1300,
  resumeToListen: 900,
  resumeSilence: 2400,
  resumeCheck: 600,
  resumeMore: 1200,
  resumeHold: 900,
} as const;

/**
 * At most this many nudges per spoken card. A spoken card never ends by itself (Jesse, October 18:
 * cards moved on mid-sentence): after the nudges it keeps listening until the person taps Next.
 */
export const MAX_NUDGES = 2;
/**
 * A typed card nudges once: the second Next moves on (Jesse, October 16). Someone typing has read the
 * chips already; repeating the nudge only made Next look broken.
 */
export const MAX_TYPED_NUDGES = 1;

/** The skip labels the card and the review show. */
export const SKIP_LABELS: Record<SkipReason, string> = {
  skip: "Skipped",
  dontknow: "You don't know yet",
  someone: "Someone else should answer",
};

export type DeckPhase = "speaking" | "ready" | "listening" | "checking" | "more" | "got" | "saved" | "skipped" | "done";
export type DeckMode = "voice" | "text";
export type DeckTimerKind = "listen" | "silence" | "pause" | "check" | "serverWait" | "advance" | "speakFallback" | "autoAdvance" | "nudge";
export type DeckTimer = { id: number; kind: DeckTimerKind; ms: number };
export type SpeechErrorCode = "permission_denied" | "not_available" | "network" | "other";

export type DeckVoiceLine = { lineId: string; text: string; kind: "question" | "nudge" | "line" };

export type DeckState = {
  /** The advisor's questions, then the "Anything else?" card (`isElse`), as buildQuestions makes them. */
  questions: HandsFreeQuestion[];
  /** The advisor's questions only: the 6 in "Question 2 of 6". */
  total: number;
  /** The card being answered. */
  idx: number;
  /** A past card being looked at (Previous / swipe right), or null. */
  view: number | null;
  /** After Add more on a past card: where to continue from (the earliest card left unfinished). */
  resumeTo: number | null;
  phase: DeckPhase;
  mode: DeckMode;
  /** Words on this card from earlier microphone sessions (and from Add more). */
  heard: string;
  /** Words from the current microphone session. Use `deckText(state)` for the caption. */
  live: string;
  /** The typing box. */
  typed: string;
  /** Hint ids heard on this card, in hint order. */
  covered: string[];
  /** Where this card's words came from so far (the speech service, and whether the person typed). */
  input: CardInput;
  nudges: number;
  /** The hint whose nudge is showing (its chip pulses), or null. */
  nudgeHint: string | null;
  /** Which answer attempt this is (0, then 1 after a nudge…). Null after Add more or switching to voice: free talk. */
  attempt: number | null;
  paused: boolean;
  /** The skip sheet is open. */
  sheet: boolean;
  /** "We couldn't hear that." */
  speechError: boolean;
  /** The microphone is blocked or there is no recognizer: typing only, with the note. */
  micBlocked: boolean;
  offline: boolean;
  /** One per card (same order as `questions`); null while unanswered. */
  answers: (CardAnswer | null)[];
  timer: DeckTimer | null;
  /** Microphone session; see deckMic. */
  session: number;
  /** The check in progress while the phase is `checking`. */
  check: { id: number; minDone: boolean; waiting: boolean } | null;
  /** Ask the server too (company has an approved AI connection). */
  serverCheck: boolean;
  speak: boolean;
  autoAdvance: boolean;
  followUps: "table" | "ai";
  voiceLine: DeckVoiceLine | null;
  autoPending: boolean;
  followUp: { text: string; hintId: string } | null;
  pendingNudge: string | null;
  /** Words on cards left for Add more on an earlier one (one per card); given back when the deck returns to it. */
  parked: DeckPark[];
  announce: string;
  announceId: number;
  /** Id source for timers and checks. */
  seq: number;
};

/** What was said on a card left for Add more on an earlier card. */
export type DeckPark = { idx: number; text: string; covered: string[]; nudges: number; nudgeHint: string | null; input?: CardInput };

export type DeckEvent =
  | { type: "timer"; id: number }
  /** Full text heard since the microphone session started (interim words included). */
  | { type: "speech"; session: number; text: string; via?: HandsFreeVoiceVia }
  /** Optional: the recognizer itself detected the end of an utterance. */
  | { type: "speechEnd"; session: number }
  | { type: "speechError"; code: SpeechErrorCode; session?: number }
  | { type: "serverCoverage"; checkId: number; covered: string[] | null; followUp?: { text: string; hintId: string } | null }
  | { type: "speechOutStart" | "speechOutEnd" | "speechOutError"; lineId: string }
  | { type: "bargeIn" }
  /** Explicit tap on the current question to hear it again. */
  | { type: "replayQuestion" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "keepTalking" }
  | { type: "prev" }
  | { type: "fwd" }
  /** "Back to question N" while looking at a past card. */
  | { type: "return" }
  | { type: "addMore" }
  | { type: "openSkip" }
  /** "Keep answering" or a tap outside the sheet. */
  | { type: "closeSkip" }
  | { type: "skip"; reason: SkipReason }
  | { type: "toText" }
  | { type: "toVoice" }
  | { type: "typed"; text: string }
  /** Next in typing mode: check what was typed. */
  | { type: "next" }
  /** "Try again" after a speech error. */
  | { type: "retry" }
  /** "No, that's all" on the "Anything else?" card. */
  | { type: "finish" }
  | { type: "online"; online: boolean }
  /**
   * A card's recording turned into text (the recorded backup, October 19). `replace` is the live
   * text heard while it recorded. Applies to an answered card, or to any card once the deck is done;
   * a card still being answered ignores it (the caller keeps it until the card ends).
   */
  | { type: "recorded"; idx: number; replace: string; text: string; via: HandsFreeVoiceVia; before?: string };

export type DeckOptions = {
  /** `text` when the person chose typing or there is no recognizer. Default `voice`. */
  mode?: DeckMode;
  /** Microphone blocked or no recognizer: starts in typing with the note. */
  micBlocked?: boolean;
  serverCheck?: boolean;
  speak?: boolean;
  autoAdvance?: boolean;
  followUps?: "table" | "ai";
  offline?: boolean;
  /** A saved draft (same order as `questions`): the deck starts at the first unanswered card. */
  answers?: (CardAnswer | null)[];
};

/* ----------------------------------------------------------------- copy */

const ANNOUNCE = {
  checking: "Checking",
  paused: "Paused. Microphone off.",
  listeningAgain: "Listening again",
  typing: "Typing. Tap Next when you are done.",
  micBlocked: "Microphone blocked. You can type instead.",
  noRecognizer: "Voice answers are not available on this phone. You can type instead.",
  stillBlocked: "Microphone is blocked. Keep typing, or allow the microphone in your phone settings.",
  speechError: "We couldn't hear that. Try again or type instead.",
  offline: "You're offline. Your answers are saved on this phone and will be sent when you're back online.",
  online: "You're back online.",
  done: "Here's what we heard. Check it, then tap Send.",
  covered: "That covers it. Tap Next when you're ready.",
  skipSheet: "Skip this one? Pick whichever fits.",
};

/* -------------------------------------------------------------- helpers */

const HOLDS: DeckPhase[] = ["got", "saved", "skipped"];
const isHold = (p: DeckPhase) => HOLDS.includes(p);
const join = (a: string, b: string) => [a.trim(), b.trim()].filter(Boolean).join(" ");

const current = (s: DeckState) => s.questions[s.idx];
const spoken = (s: DeckState) => join(s.heard, s.live);
/** What the person has said or typed on the current card. */
const cardText = (s: DeckState) => (s.mode === "text" ? s.typed.trim() : spoken(s));

const say = (s: DeckState, text: string): DeckState => ({ ...s, announce: text, announceId: s.announceId + 1 });
const setTimer = (s: DeckState, kind: DeckTimerKind, ms: number): DeckState => ({ ...s, timer: { id: s.seq + 1, kind, ms }, seq: s.seq + 1 });
const clearTimer = (s: DeckState): DeckState => (s.timer ? { ...s, timer: null } : s);

function cardAnnounce(s: DeckState, i: number) {
  const q = s.questions[i];
  return q.isElse ? `One last thing. ${q.text}` : `Question ${i + 1} of ${s.total}. ${q.text}`;
}

function micOn(s: DeckState) {
  return (
    s.mode === "voice" &&
    !s.micBlocked &&
    !s.paused &&
    s.view == null &&
    !s.sheet &&
    !s.speechError &&
    (s.phase === "listening" || s.phase === "checking" || s.phase === "more" || s.phase === "speaking")
  );
}

/** New "Heard: <chip>" for chips that just ticked (the last one, as in the prototype). */
function heardAnnounce(s: DeckState, before: string[]): DeckState {
  const fresh = s.covered.filter((id) => !before.includes(id));
  if (!fresh.length) return s;
  // The last chip: the card is ready, and Next lights up (a spoken card never moves on by itself).
  if (s.mode === "voice" && current(s).hints.every((h) => s.covered.includes(h.id))) return say(s, ANNOUNCE.covered);
  const hint = current(s).hints.find((h) => h.id === fresh[fresh.length - 1]);
  return hint ? say(s, `Heard: ${hint.label}`) : s;
}

/* ----------------------------------------------------------- transitions */

function speakLine(s: DeckState, text: string, kind: DeckVoiceLine["kind"]): DeckState {
  const seq = s.seq + 1;
  const line = { lineId: `line-${seq}`, text, kind };
  const duration = text.trim().split(/\s+/).filter(Boolean).length * 400 + DECK_TIMING.speakFallback;
  return setTimer({ ...s, seq, voiceLine: line, phase: s.phase === "done" ? "done" : "speaking" }, "speakFallback", duration);
}

function finishSpeaking(s: DeckState): DeckState {
  const line = s.voiceLine;
  if (!line) return s;
  const next = { ...clearTimer(s), voiceLine: null };
  if (s.phase === "done") return next;
  if (line.kind === "line" && next.autoPending) {
    return setTimer({ ...next, phase: "listening", heard: spoken(next), session: next.session + 1, live: "" }, "autoAdvance", DECK_TIMING.autoAdvance);
  }
  return listen(next, line.kind === "nudge" && next.attempt != null ? next.attempt + 1 : next.attempt);
}

function startCard(s: DeckState, i: number): DeckState {
  const park = s.parked.find((p) => p.idx === i) ?? null;
  let next: DeckState = {
    ...s,
    idx: i,
    view: null,
    resumeTo: null,
    phase: "ready",
    heard: s.mode === "voice" ? park?.text || "" : "",
    live: "",
    typed: s.mode === "text" ? park?.text || "" : "",
    covered: park?.covered || [],
    input: park?.input ? { ...park.input } : {},
    nudges: park?.nudges || 0,
    nudgeHint: park?.nudgeHint ?? null,
    attempt: park ? null : 0,
    paused: false,
    sheet: false,
    speechError: false,
    check: null,
    parked: park ? s.parked.filter((p) => p !== park) : s.parked,
    timer: null,
    voiceLine: null,
    autoPending: false,
    followUp: null,
    pendingNudge: null,
  };
  next = say(next, cardAnnounce(next, i));
  if (next.speak && next.mode === "voice" && !next.micBlocked && !park) return speakLine(next, next.questions[i].isElse ? `One last thing. ${next.questions[i].text}` : next.questions[i].text, "question");
  return next.mode === "voice" && !next.micBlocked ? setTimer(next, "listen", DECK_TIMING.cardToListen) : next;
}

/** Microphone on for a new attempt: words so far are kept, a new session starts. */
function listen(s: DeckState, attempt: number | null, silenceMs?: number): DeckState {
  const q = current(s);
  const next: DeckState = {
    ...s,
    phase: "listening",
    attempt,
    heard: spoken(s),
    live: "",
    session: s.session + 1,
    check: null,
  };
  if (next.mode !== "voice" || next.micBlocked) return clearTimer(next);
  return setTimer(next, "silence", q.isElse ? DECK_TIMING.elseSilence : silenceMs ?? DECK_TIMING.silenceToCheck);
}

function needsServer(s: DeckState) {
  const q = current(s);
  return (
    s.serverCheck &&
    !s.offline &&
    !q.isElse &&
    !!cardText(s) &&
    q.hints.some((h) => !s.covered.includes(h.id)) &&
    !(s.mode === "voice" && spokenSkip(cardText(s)))
  );
}

/** Words stopped: show Checking. With nothing said on an advisor's card, keep listening (prototype). */
function startCheck(s: DeckState): DeckState {
  if (s.phase !== "listening") return s;
  if (!cardText(s) && !current(s).isElse) return clearTimer(s);
  const id = s.seq + 1;
  const next = say({ ...s, seq: id, phase: "checking", check: { id, minDone: false, waiting: needsServer(s) } }, ANNOUNCE.checking);
  return setTimer(next, "check", DECK_TIMING.checkingMin);
}

/**
 * After a pause on a spoken card: a nudge for a missing chip (at most MAX_NUDGES), otherwise back to
 * listening. It never ends the card (October 18): only a whole-answer skip phrase does; Next ends it.
 */
function afterPause(s: DeckState, allowAuto = true): DeckState {
  const q = current(s);
  const skip = wholeSkip(cardText(s));
  if (skip) return skipCard(s, skip);
  const missing = q.isElse ? undefined : q.hints.find((h) => !s.covered.includes(h.id));
  if (missing && s.nudges < MAX_NUDGES) {
    let next: DeckState = { ...s, phase: "more", check: null, nudges: s.nudges + 1, nudgeHint: missing.id, timer: null };
    const candidate = s.followUps === "ai" && s.followUp?.hintId === missing.id ? s.followUp.text : missing.nudge;
    next = say(next, candidate);
    if (next.speak && !next.micBlocked) return setTimer({ ...next, pendingNudge: candidate }, "nudge", DECK_TIMING.pauseToCheck);
    return next.micBlocked ? next : setTimer(next, "listen", DECK_TIMING.moreToListen);
  }
  if (allowAuto && s.autoAdvance && !q.isElse && q.hints.length > 0 && q.hints.every((h) => s.covered.includes(h.id))) {
    const next = { ...s, check: null, autoPending: true };
    return s.speak ? speakLine(next, "Got it. Next question.", "line") : setTimer({ ...next, phase: "listening" }, "autoAdvance", DECK_TIMING.autoAdvance);
  }
  return keepListening(s);
}

/** The microphone stays on and the card waits for more words or Next; no timer. */
function keepListening(s: DeckState): DeckState {
  return { ...s, phase: "listening", check: null, timer: null };
}

/** Next on a spoken card: ends it now, Got it with every chip heard, Saved otherwise; no nudge. */
function nextSpoken(s: DeckState): DeckState {
  const q = current(s);
  const text = cardText(s);
  const skip = spokenSkip(text);
  if (skip) return skipCard(s, skip);
  if (q.isElse) return text ? endCard(s, "got") : toDone(s);
  return endCard(s, q.hints.every((h) => s.covered.includes(h.id)) ? "got" : "saved");
}

/** Next on a typed card (the prototype's hfEval): skip, else-card, got, saved, or a nudge. */
function evaluate(s: DeckState): DeckState {
  const q = current(s);
  const text = cardText(s);
  const skip = s.mode === "voice" ? spokenSkip(text) : null;
  if (skip) return skipCard(s, skip);
  if (q.isElse) return text ? endCard(s, "got") : toDone(s);
  const missing = q.hints.find((h) => !s.covered.includes(h.id));
  if (!missing) return endCard(s, "got");
  if (s.nudges >= (s.mode === "text" ? MAX_TYPED_NUDGES : MAX_NUDGES)) return endCard(s, "saved");
  let next: DeckState = { ...s, phase: "more", check: null, nudges: s.nudges + 1, nudgeHint: missing.id, timer: null };
  next = say(next, missing.nudge);
  return next.mode === "voice" && !next.micBlocked ? setTimer(next, "listen", DECK_TIMING.moreToListen) : next;
}

function endCard(s: DeckState, status: "got" | "saved"): DeckState {
  const q = current(s);
  const answers = [...s.answers];
  answers[s.idx] = { status, raw: cardText(s), covered: [...s.covered], ...withInput(s) };
  let next: DeckState = { ...s, phase: status, answers, check: null, sheet: false, autoPending: false, voiceLine: null };
  next = say(next, q.isElse ? "Got it." : `Question ${s.idx + 1} of ${s.total}, ${status === "saved" ? "saved" : "got it"}.`);
  if (s.speak && s.mode === "voice" && !s.autoPending) {
    const seq = next.seq + 1;
    next = { ...next, seq, voiceLine: { lineId: `line-${seq}`, text: status === "saved" ? "Saved." : "Got it.", kind: "line" } };
  }
  return setTimer(next, "advance", status === "saved" ? DECK_TIMING.savedHold : DECK_TIMING.gotHold);
}

/** The card's input for its answer, only when something was said or typed. */
function withInput(s: DeckState): { input?: CardInput } {
  return s.input.voice || s.input.typed ? { input: { ...s.input } } : {};
}

function skipCard(s: DeckState, reason: SkipReason): DeckState {
  const q = current(s);
  const answers = [...s.answers];
  const raw = cardText(s);
  answers[s.idx] = { status: "skipped", raw, covered: [], reason, ...(raw ? withInput(s) : {}) };
  let next: DeckState = { ...s, phase: "skipped", answers, sheet: false, paused: false, check: null, view: null, voiceLine: null, autoPending: false };
  const label = SKIP_LABELS[reason];
  next = say(next, q.isElse ? `${label}.` : `Question ${s.idx + 1} of ${s.total}, ${label.toLowerCase()}.`);
  return setTimer(next, "advance", DECK_TIMING.skippedHold);
}

/** The prototype's hfNext: the first unanswered card from here (or from where Add more left off). */
function advance(s: DeckState): DeckState {
  const start = s.resumeTo != null ? s.resumeTo : s.idx + 1;
  for (let i = start; i < s.questions.length; i++) if (!s.answers[i]) return startCard(s, i);
  return toDone(s);
}

function toDone(s: DeckState): DeckState {
  const next = say({ ...s, phase: "done", timer: null, view: null, sheet: false, paused: false, check: null, voiceLine: null, autoPending: false }, ANNOUNCE.done);
  return next.speak && next.mode === "voice" ? speakLine(next, ANNOUNCE.done, "line") : next;
}

/** The prototype's hfResume: pick up the one timer for the current phase. */
function resume(s: DeckState): DeckState {
  const next = clearTimer(s);
  if (next.paused || next.view != null || next.sheet || next.phase === "done") return next;
  if (isHold(next.phase)) return setTimer(next, "advance", DECK_TIMING.resumeHold);
  if (next.mode !== "voice" || next.micBlocked || next.speechError) return next;
  switch (next.phase) {
    case "speaking":
      return next.voiceLine ? speakLine({ ...next, voiceLine: null }, current(next).isElse ? `One last thing. ${current(next).text}` : current(next).text, "question") : listen(next, next.attempt);
    case "ready":
      return setTimer(next, "listen", DECK_TIMING.resumeToListen);
    case "listening":
      return setTimer(next, "silence", current(next).isElse ? DECK_TIMING.elseSilence : DECK_TIMING.resumeSilence);
    case "checking":
      // Do not wait for a server answer again after a pause: the local result stands.
      return setTimer({ ...next, check: next.check ? { ...next.check, waiting: false } : null }, "check", DECK_TIMING.resumeCheck);
    case "more":
      return next.pendingNudge && next.speak ? setTimer(next, "nudge", DECK_TIMING.pauseToCheck) : setTimer(next, "listen", DECK_TIMING.resumeMore);
  }
  return next;
}

function pastCardAnnounce(s: DeckState, v: number) {
  const a = s.answers[v];
  return `Question ${v + 1}. ${s.questions[v].text}${a?.raw ? ` You said: ${a.raw}` : ""}`;
}

function backToCurrent(s: DeckState): DeckState {
  const label = current(s).isElse ? "Back to the last card" : `Back to question ${s.idx + 1}`;
  const next = say({ ...s, view: null }, label);
  return next.phase === "speaking" ? listen({ ...next, voiceLine: null, autoPending: false }, next.attempt) : resume(next);
}

/* --------------------------------------------------------------- public */

export function createDeck(questions: HandsFreeQuestion[], opts: DeckOptions = {}): DeckState {
  const answers = questions.map((_, i) => opts.answers?.[i] ?? null);
  const micBlocked = !!opts.micBlocked;
  const base: DeckState = {
    questions,
    total: questions.filter((q) => !q.isElse).length,
    idx: 0,
    view: null,
    resumeTo: null,
    phase: "ready",
    mode: micBlocked ? "text" : opts.mode || "voice",
    heard: "",
    live: "",
    typed: "",
    covered: [],
    input: {},
    nudges: 0,
    nudgeHint: null,
    attempt: 0,
    paused: false,
    sheet: false,
    speechError: false,
    micBlocked,
    offline: !!opts.offline,
    answers,
    timer: null,
    session: 0,
    check: null,
    serverCheck: !!opts.serverCheck,
    speak: !!opts.speak,
    autoAdvance: !!opts.autoAdvance,
    followUps: opts.followUps ?? "table",
    voiceLine: null,
    autoPending: false,
    followUp: null,
    pendingNudge: null,
    parked: [],
    announce: "",
    announceId: 0,
    seq: 0,
  };
  const first = answers.findIndex((a) => !a);
  return first < 0 ? toDone(base) : startCard(base, first);
}

function step(s: DeckState, e: DeckEvent): DeckState {
  if (s.phase === "done" && e.type !== "online" && e.type !== "recorded" && e.type !== "timer" && e.type !== "speechOutEnd" && e.type !== "speechOutError" && e.type !== "speechOutStart") return s;
  const q = current(s);
  switch (e.type) {
    case "timer": {
      if (!s.timer || s.timer.id !== e.id) return s;
      const kind = s.timer.kind;
      const t = clearTimer(s);
      if (kind === "speakFallback" && t.voiceLine) return finishSpeaking(t);
      if (kind === "nudge" && t.phase === "more" && t.pendingNudge) return speakLine({ ...t, pendingNudge: null }, t.pendingNudge, "nudge");
      if (kind === "autoAdvance" && t.autoPending && t.phase === "listening" && !t.paused && !t.sheet && t.view == null && !q.isElse && q.hints.length > 0 && q.hints.every((h) => t.covered.includes(h.id))) return endCard(t, "got");
      if (kind === "listen" && (t.phase === "ready" || t.phase === "more")) {
        const attempt = t.phase === "ready" ? t.attempt : t.attempt == null ? null : t.attempt + 1;
        return listen(t, attempt);
      }
      if ((kind === "silence" || kind === "pause") && t.phase === "listening") {
        // "Anything else?" waits for Next or "No, that's all", also after silence (October 18).
        if (q.isElse) return keepListening(t);
        return startCheck(t);
      }
      if (kind === "check" && t.phase === "checking") {
        if (t.check?.waiting) {
          const left = DECK_TIMING.serverWaitMax - DECK_TIMING.checkingMin;
          return setTimer({ ...t, check: { ...t.check, minDone: true } }, "serverWait", left);
        }
        return t.mode === "voice" ? afterPause(t) : evaluate(t);
      }
      if (kind === "serverWait" && t.phase === "checking") return t.mode === "voice" ? afterPause(t) : evaluate(t);
      if (kind === "advance" && isHold(t.phase)) return advance(t);
      return t;
    }

    case "speech": {
      if (e.session !== s.session || !micOn(s) || s.phase === "speaking" || e.text === s.live) return s;
      let next: DeckState = { ...s, live: e.text, autoPending: e.text.trim() ? false : s.autoPending, pendingNudge: null };
      if (e.text.trim()) next = { ...next, input: { ...s.input, voice: e.via ?? s.input.voice ?? "voice_browser" } };
      const before = s.covered;
      next = { ...next, covered: coverLocally(spoken(next), q.hints, before).covered };
      next = heardAnnounce(next, before);
      // Talking again during Checking or a nudge: back to listening, the check waits for the next pause.
      if (next.phase !== "listening") next = { ...next, phase: "listening", check: null };
      return spoken(next) ? setTimer(next, "pause", DECK_TIMING.pauseToCheck) : next;
    }

    case "speechEnd": {
      if (e.session !== s.session || !micOn(s) || s.phase !== "listening" || !spoken(s)) return s;
      // A recognizer end callback can arrive before the person has finished their thought.
      // Spoken prompts and auto-advance still require a full quiet interval.
      return s.speak || s.autoAdvance ? setTimer(s, "pause", DECK_TIMING.pauseToCheck) : startCheck(clearTimer(s));
    }

    case "speechError": {
      if (e.session != null && e.session !== s.session) return s;
      if (e.code === "permission_denied" || e.code === "not_available") {
        const held = isHold(s.phase);
        let next: DeckState = {
          ...s,
          mode: "text",
          micBlocked: true,
          speechError: false,
          paused: false,
          typed: s.typed || spoken(s),
          phase: held ? s.phase : s.phase === "more" ? "more" : spoken(s) ? "listening" : "ready",
          check: null,
          timer: null,
        };
        next = say(next, e.code === "permission_denied" ? ANNOUNCE.micBlocked : ANNOUNCE.noRecognizer);
        return held ? setTimer(next, "advance", DECK_TIMING.resumeHold) : next;
      }
      if (s.mode !== "voice" || isHold(s.phase)) return s;
      return say({ ...s, speechError: true, timer: null, check: null, phase: s.phase === "checking" ? "listening" : s.phase }, ANNOUNCE.speechError);
    }

    case "serverCoverage": {
      if (!s.check || s.check.id !== e.checkId || s.phase !== "checking") return s;
      const before = s.covered;
      const candidate = e.followUp;
      const validFollowUp = candidate && candidate.text.trim() && candidate.text.trim().split(/\s+/).length <= 20 && (candidate.text.match(/\?/g) || []).length <= 1 && q.hints.some((h) => h.id === candidate.hintId && !before.includes(h.id) && !(e.covered || []).includes(h.id));
      const ids = new Set([...before, ...(e.covered || [])]);
      let next: DeckState = { ...s, covered: q.hints.filter((h) => ids.has(h.id)).map((h) => h.id), check: { ...s.check, waiting: false }, followUp: validFollowUp ? { text: candidate!.text.trim(), hintId: candidate!.hintId } : null };
      next = heardAnnounce(next, before);
      // Paused, a past card or the skip sheet: keep the result; resume() checks again from it.
      if (s.paused || s.view != null || s.sheet) return next;
      if (!next.check!.minDone) return next;
      // A late answer follows the same rules as the timer: a spoken card never ends by itself
      // (October 21: answers cut off when the server answered between 0.75 s and 2.5 s).
      return next.mode === "voice" ? afterPause(clearTimer(next), false) : evaluate(clearTimer(next));
    }

    case "speechOutStart":
      return s;
    case "speechOutEnd":
    case "speechOutError":
      if (s.voiceLine?.lineId !== e.lineId || s.paused || s.view != null || s.sheet) return s;
      return isHold(s.phase) ? { ...s, voiceLine: null } : finishSpeaking(s);
    case "bargeIn":
      if (s.phase !== "speaking" || !micOn(s)) return s;
      return listen({ ...clearTimer(s), voiceLine: null, autoPending: false }, s.attempt);
    case "replayQuestion":
      if (!s.speak || s.mode !== "voice" || s.micBlocked || s.paused || s.sheet || s.view != null || s.speechError || isHold(s.phase)) return s;
      return speakLine({ ...s, check: null, autoPending: false }, q.isElse ? `One last thing. ${q.text}` : q.text, "question");

    case "pause": {
      if (s.paused) return s;
      return say({ ...s, paused: true, timer: null, autoPending: false }, ANNOUNCE.paused);
    }

    case "resume": {
      if (!s.paused) return s;
      return resume(say({ ...s, paused: false }, ANNOUNCE.listeningAgain));
    }

    case "keepTalking": {
      if ((s.phase !== "got" && s.phase !== "saved") || s.view != null) return s;
      const answers = [...s.answers];
      answers[s.idx] = null;
      let next: DeckState = say({ ...s, answers, paused: false, timer: null }, ANNOUNCE.listeningAgain);
      if (next.mode === "voice" && !next.micBlocked) return listen(next, next.attempt == null ? null : next.attempt + 1);
      next = { ...next, phase: "listening" };
      return next;
    }

    case "prev": {
      const base = s.view != null ? s.view : s.idx;
      if (base <= 0) return s;
      const v = base - 1;
      return say({ ...s, view: v, sheet: false, timer: null }, pastCardAnnounce(s, v));
    }

    case "fwd": {
      if (s.view == null) return s;
      const v = s.view + 1;
      if (v >= s.idx) return backToCurrent(s);
      return say({ ...s, view: v }, pastCardAnnounce(s, v));
    }

    case "return":
      return s.view == null ? s : backToCurrent(s);

    case "addMore": {
      const v = s.view;
      if (v == null) return s;
      const a = s.answers[v];
      const answers = [...s.answers];
      answers[v] = null;
      // Keep anything already said on the card being left, for when the deck comes back to it.
      // Add more again from an Add-more card: come back to that card first (the earliest one left).
      const held = isHold(s.phase);
      const leftText = held ? "" : cardText(s);
      const others = s.parked.filter((p) => p.idx !== s.idx);
      const parked = !held && (leftText || s.covered.length)
        ? [...others, { idx: s.idx, text: leftText, covered: [...s.covered], nudges: s.nudges, nudgeHint: s.nudgeHint, input: { ...s.input } }]
        : others;
      const back = held ? s.idx + 1 : s.idx;
      let next: DeckState = {
        ...s,
        answers,
        parked,
        resumeTo: s.resumeTo == null ? back : Math.min(s.resumeTo, back),
        idx: v,
        view: null,
        heard: s.mode === "voice" ? a?.raw || "" : "",
        live: "",
        typed: s.mode === "text" ? a?.raw || "" : "",
        covered: a?.covered ? [...a.covered] : [],
        input: a?.input ? { ...a.input } : {},
        nudges: 0,
        nudgeHint: null,
        paused: false,
        sheet: false,
        speechError: false,
        check: null,
        timer: null,
      };
      next = say(next, `Question ${v + 1}, listening. Add whatever you like.`);
      if (next.mode === "voice" && !next.micBlocked) return listen(next, null);
      return { ...next, phase: "listening" };
    }

    case "openSkip": {
      if (s.view != null || isHold(s.phase) || s.sheet) return s;
      return say({ ...s, sheet: true, timer: null }, ANNOUNCE.skipSheet);
    }

    case "closeSkip":
      return s.sheet ? resume({ ...s, sheet: false }) : s;

    case "skip":
      if (isHold(s.phase) || s.view != null) return s;
      return skipCard(clearTimer(s), e.reason);

    case "toText": {
      if (s.mode === "text") return s;
      const held = isHold(s.phase);
      let next: DeckState = {
        ...s,
        mode: "text",
        speechError: false,
        paused: false,
        typed: s.typed || spoken(s),
        check: null,
        timer: null,
      };
      next = { ...next, phase: held ? s.phase : s.phase === "more" ? "more" : next.typed.trim() ? "listening" : "ready" };
      next = say(next, ANNOUNCE.typing);
      return held ? setTimer(next, "advance", DECK_TIMING.resumeHold) : next;
    }

    case "toVoice": {
      if (s.mode === "voice") return s;
      if (s.micBlocked) return say(s, ANNOUNCE.stillBlocked);
      const held = isHold(s.phase);
      const next: DeckState = { ...s, mode: "voice", heard: s.typed.trim() || s.heard, live: "", typed: "", paused: false, timer: null };
      if (held) return setTimer(next, "advance", DECK_TIMING.resumeHold);
      if (s.view != null || s.sheet) return next;
      return listen(next, null);
    }

    case "typed": {
      if (s.mode !== "text" || s.view != null || isHold(s.phase)) return s;
      const covered = coverLocally(e.text, q.hints, s.covered).covered;
      const input = e.text !== s.typed ? { ...s.input, typed: true } : s.input;
      return { ...s, typed: e.text, covered, input, phase: s.phase === "ready" ? "listening" : s.phase };
    }

    case "next": {
      if (isHold(s.phase) || s.view != null || s.sheet) return s;
      return s.mode === "voice" ? nextSpoken({ ...clearTimer(s), voiceLine: null, autoPending: false }) : evaluate(clearTimer(s));
    }

    case "retry": {
      if (!s.speechError) return s;
      return listen(say({ ...s, speechError: false, paused: false }, ANNOUNCE.listeningAgain), s.attempt);
    }

    case "finish":
      return q.isElse && !isHold(s.phase) ? toDone(s) : s;

    case "recorded": {
      const rq = s.questions[e.idx];
      if (!rq || (e.idx === s.idx && s.phase !== "done" && !s.answers[e.idx])) return s;
      const a = applyRecorded(s.answers[e.idx], rq, e.replace, e.text, e.via, e.before);
      if (a === s.answers[e.idx]) return s;
      const answers = [...s.answers];
      answers[e.idx] = a;
      return { ...s, answers };
    }

    case "online": {
      if (s.offline === !e.online) return s;
      return say({ ...s, offline: !e.online }, e.online ? ANNOUNCE.online : ANNOUNCE.offline);
    }
  }
}

/**
 * Applies one event. When the microphone goes from on to off, the words of that session are
 * kept with the card and the session number moves on, so the next time it opens it is a new one.
 */
export function deckReducer(s: DeckState, e: DeckEvent): DeckState {
  let next = step(s, e);
  if (next === s) return s;
  if (next.voiceLine && next.phase !== "speaking" && next.phase !== "done" && !isHold(next.phase)) next = { ...next, voiceLine: null };
  if (micOn(s) && !micOn(next) && next.session === s.session) {
    return { ...next, heard: join(next.heard, next.live), live: "", session: next.session + 1 };
  }
  return next;
}

/* --------------------------------------------------------------- effects */

/** The one timer to have scheduled. Schedule again whenever `id` changes; none when null. */
export function deckTimer(s: DeckState): DeckTimer | null {
  return s.timer;
}

/**
 * Whether the microphone should be on. Restart it when `session` changes. `script` is for the
 * simulated recognizer (the prototype's scripted words per card and attempt); null means free talk.
 */
export function deckMic(s: DeckState): { on: boolean; session: number; script: { questionIndex: number; attempt: number } | null } {
  return { on: micOn(s), session: s.session, script: s.attempt == null ? null : { questionIndex: s.idx, attempt: s.attempt } };
}

/** A server check to run now (once per `checkId`), or null. */
export function deckServerCheck(s: DeckState): { checkId: number; questionKey: HandsFreeQuestion["key"]; text: string } | null {
  if (s.phase !== "checking" || !s.check?.waiting || s.paused || s.view != null || s.sheet) return null;
  return { checkId: s.check.id, questionKey: current(s).key, text: cardText(s) };
}

export function deckVoice(s: DeckState): DeckVoiceLine | null {
  return s.speak && (s.phase === "speaking" || s.phase === "done" || isHold(s.phase)) && !s.paused && s.view == null && !s.sheet && s.mode === "voice" && !s.speechError ? s.voiceLine : null;
}

export function deckEffects(s: DeckState) {
  return { timer: deckTimer(s), mic: deckMic(s), serverCheck: deckServerCheck(s), voice: deckVoice(s) };
}

/* ---------------------------------------------------------------- views */

/** The card on screen: the past card being looked at, or the current one. */
export const shownIndex = (s: DeckState) => (s.view != null ? s.view : s.idx);

/** The caption (voice) or typing-box text for the current card. */
export const deckText = (s: DeckState) => (s.mode === "text" ? s.typed : spoken(s));

/** "Question 2 of 6", or "One last thing" on the "Anything else?" card. */
export function progressLabel(s: DeckState) {
  const i = shownIndex(s);
  return s.questions[i]?.isElse ? "One last thing" : `Question ${i + 1} of ${s.total}`;
}

/** One segment per advisor question for the progress bar. */
export function progressSegments(s: DeckState): ("got" | "saved" | "skipped" | "current" | "todo")[] {
  return s.questions
    .filter((q) => !q.isElse)
    .map((_, i) => {
      const a = s.answers[i];
      if (a) return a.status;
      return i === s.idx && s.phase !== "done" ? "current" : "todo";
    });
}

/**
 * Next is lit (primary) on a spoken card once every "Try to cover" chip is heard, or on "Anything
 * else?" once something was said. It is always there; tapping it earlier saves what was said.
 */
export function deckReady(s: DeckState): boolean {
  const q = current(s);
  if (!q || s.view != null || isHold(s.phase) || s.phase === "done") return false;
  if (q.isElse) return !!cardText(s);
  return q.hints.length > 0 && q.hints.every((h) => s.covered.includes(h.id));
}

/** The status shown on a card: its live phase when it is the current one, else its answer. */
export function cardStatus(s: DeckState, i: number): DeckPhase | "idle" {
  if (i === s.idx && s.view == null) return s.phase;
  return s.answers[i]?.status || "idle";
}
