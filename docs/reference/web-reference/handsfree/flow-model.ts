/**
 * The pure parts of the web hands-free cards (docs/specs/COMPANION-HANDS-FREE.md §9.3): which screen
 * shows, the draft kept on this device, the review's blocks, the submit body, the keyboard map and
 * the copy. No React and no browser objects, so tests/handsfree-web-flow.test.ts runs it in Node.
 * The deck's own rules live in shared/hands-free/deck.ts.
 */
import { SKIP_LABELS, type DeckMode } from "../../../shared/hands-free/deck.ts";
import { hasSomethingToSend, toSubmission } from "../../../shared/hands-free/submission.ts";
import type { CardAnswer, HandsFreeQuestion, HandsFreeSubmission, QuestionKey, UnderstoodAnswer } from "../../../shared/hands-free/types.ts";
import type { SpeechSourceKind } from "./speech/types.ts";

/* ── Screens ─────────────────────────────────────────────────────────────── */

export type FlowScreen = "intro" | "consent" | "deck" | "review" | "sent";

export type FlowState = {
  screen: FlowScreen;
  /** How the deck starts: the person's choice, or typing when the microphone was refused. */
  mode: DeckMode;
  /** Why the microphone is off before the deck starts: the note above the typing box. */
  micBlocked: "permission" | "unavailable" | null;
  /** A new deck run (a fresh reducer) each time the deck is entered. */
  run: number;
};

export type FlowEvent =
  /** "Start with voice". `consented`: the microphone explanation was accepted on this device before. */
  | { type: "startVoice"; consented: boolean }
  | { type: "typeInstead" }
  /** The browser gave the microphone on the consent screen. */
  | { type: "allowed" }
  /** The browser refused it (or has none): typing with the note. */
  | { type: "denied"; reason?: "permission" | "unavailable" }
  /** The top bar's Back (consent and deck; the review has its own Change wording). */
  | { type: "back" }
  | { type: "deckDone" }
  /** "Start the questions again" on a review with nothing to send. */
  | { type: "restart" }
  | { type: "sent" };

/** A draft that reached the review opens there; anything else opens on the intro. */
export function initialFlow(draft: Pick<HandsFreeDraft, "stage" | "mode"> | null): FlowState {
  return { screen: draft?.stage === "review" ? "review" : "intro", mode: draft?.mode ?? "voice", micBlocked: null, run: 0 };
}

const toDeck = (s: FlowState, mode: DeckMode, micBlocked: FlowState["micBlocked"] = null): FlowState => ({ ...s, screen: "deck", mode, micBlocked, run: s.run + 1 });

export function flowReducer(s: FlowState, e: FlowEvent): FlowState {
  switch (e.type) {
    case "startVoice":
      if (s.screen !== "intro") return s;
      return e.consented ? toDeck(s, "voice") : { ...s, screen: "consent" };
    case "typeInstead":
      return s.screen === "intro" || s.screen === "consent" ? toDeck(s, "text") : s;
    case "allowed":
      return s.screen === "consent" ? toDeck(s, "voice") : s;
    case "denied":
      return s.screen === "consent" ? toDeck(s, "text", e.reason ?? "permission") : s;
    case "back":
      return s.screen === "consent" || s.screen === "deck" ? { ...s, screen: "intro" } : s;
    case "deckDone":
      return s.screen === "deck" ? { ...s, screen: "review" } : s;
    case "restart":
      return s.screen === "review" ? toDeck(s, s.mode) : s;
    case "sent":
      return s.screen === "review" ? { ...s, screen: "sent" } : s;
  }
}

/* ── The draft on this device ────────────────────────────────────────────── */

export type HandsFreeDraft = {
  v: 1;
  /** The questions the answers belong to; a changed request drops the draft. */
  print: string;
  answers: (CardAnswer | null)[];
  mode: DeckMode;
  stage: "deck" | "review";
  /** "Here's what we heard": undefined until asked, null when the person's own words stand. */
  understood?: UnderstoodAnswer[] | null;
  edits: Partial<Record<QuestionKey, string>>;
  /** One key for every try of the same send, so a retry after a lost answer is not a second send. */
  sendKey?: string;
  startedAt: string;
};

export const draftKey = (requestId: string) => `dg-handsfree-${requestId}`;

/** The questions' texts, in order: a draft only fits the same questions. */
export const questionsPrint = (questions: readonly HandsFreeQuestion[]) => questions.map((q) => q.text.trim()).join("\n");

export function newDraft(questions: readonly HandsFreeQuestion[], mode: DeckMode, now = new Date()): HandsFreeDraft {
  return { v: 1, print: questionsPrint(questions), answers: questions.map(() => null), mode, stage: "deck", edits: {}, startedAt: now.toISOString() };
}

const isAnswer = (a: unknown): a is CardAnswer =>
  !!a &&
  typeof a === "object" &&
  ["got", "saved", "skipped"].includes((a as CardAnswer).status) &&
  typeof (a as CardAnswer).raw === "string" &&
  Array.isArray((a as CardAnswer).covered);

/** A stored draft for these questions, or null (missing, malformed, or for other questions). */
export function parseDraft(raw: string | null | undefined, questions: readonly HandsFreeQuestion[]): HandsFreeDraft | null {
  if (!raw) return null;
  let d: any;
  try {
    d = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!d || d.v !== 1 || d.print !== questionsPrint(questions) || !Array.isArray(d.answers)) return null;
  const understood = d.understood === null ? null : Array.isArray(d.understood) ? (d.understood as UnderstoodAnswer[]).filter((u) => u && typeof u.key === "string" && typeof u.understood === "string") : undefined;
  return {
    v: 1,
    print: d.print,
    answers: questions.map((_, i) => (isAnswer(d.answers[i]) ? d.answers[i] : null)),
    mode: d.mode === "text" ? "text" : "voice",
    stage: d.stage === "review" ? "review" : "deck",
    understood,
    edits:
      d.edits && typeof d.edits === "object"
        ? (Object.fromEntries(Object.entries(d.edits).filter(([k, v]) => /^question\.\d+$/.test(k) && typeof v === "string")) as Partial<Record<QuestionKey, string>>)
        : {},
    sendKey: typeof d.sendKey === "string" ? d.sendKey : undefined,
    startedAt: typeof d.startedAt === "string" ? d.startedAt : new Date().toISOString(),
  };
}

/** True when the person has answered or skipped at least one card. */
export const draftStarted = (d: HandsFreeDraft | null) => !!d?.answers.some(Boolean);

/* ── Live words ──────────────────────────────────────────────────────────── */

const plainWords = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");

/**
 * The same words, give or take case and punctuation. OpenAI's completed transcript replaces the
 * live deltas with tidier text; when only the punctuation changed, the deck is not told again
 * while it checks, so the card does not fall back to Listening for nothing.
 */
export const sameWords = (a: string, b: string) => plainWords(a) === plainWords(b);

/** The web page's offline line: answers stay on this device, and the person sends them (nothing is sent by itself). */
export const OFFLINE_TEXT = "You're offline. Your answers are saved on this device. You can send them when you're back online.";

/**
 * The deck's announcements say "phone" (shared with the app); the web page says "browser" or
 * "device", and nothing is sent by itself when the connection returns.
 */
export function webAnnouncement(text: string) {
  return text
    .replace("You're offline. Your answers are saved on this phone and will be sent when you're back online.", OFFLINE_TEXT)
    .replace("not available on this phone", "not available in this browser")
    .replace("in your phone settings", "in your browser settings");
}

/* ── Review and submit ───────────────────────────────────────────────────── */

export type ReviewBlock =
  /** `polished`: the server made the words clearer, so "Show what I said" has something to show. */
  | { kind: "answered"; key: QuestionKey; title: string; value: string; raw: string; polished: boolean; note: string | null }
  | { kind: "skipped"; key: QuestionKey; title: string; reason: string };

/** What /team/understand is asked: the answered advisor questions, never the "Anything else?" note. */
export function understandAnswers(questions: readonly HandsFreeQuestion[], answers: readonly (CardAnswer | null)[]) {
  return questions
    .map((q, i) => ({ q, a: answers[i] }))
    .filter(({ q, a }) => !q.isElse && a && a.status !== "skipped" && a.raw.trim())
    .map(({ q, a }) => ({ key: q.key, question: q.text.slice(0, 300), text: a!.raw.trim().slice(0, 4000) }));
}

const capital = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/**
 * "Here's what we heard": one block per card. Polished text (or the person's edit, or their own
 * words) for answers; the reason for skips; the "Anything else?" card only when something was
 * said. At most one "A note for later" on the page (the first suggestion).
 */
export function reviewBlocks(
  questions: readonly HandsFreeQuestion[],
  answers: readonly (CardAnswer | null)[],
  understood: readonly UnderstoodAnswer[] | null | undefined,
  edits: Partial<Record<QuestionKey, string>>,
): ReviewBlock[] {
  const polished = new Map((understood || []).map((u) => [u.key, u]));
  let noted = false;
  const blocks: ReviewBlock[] = [];
  questions.forEach((q, i) => {
    const a = answers[i];
    const answered = !!a && a.status !== "skipped" && !!a.raw.trim();
    if (q.isElse && !answered) return;
    if (!answered) {
      blocks.push({ kind: "skipped", key: q.key, title: q.text, reason: SKIP_LABELS[a?.reason ?? "skip"] });
      return;
    }
    const u = polished.get(q.key);
    const own = a!.raw.trim();
    const note = !noted && u?.suggestion?.trim() ? u.suggestion.trim().replace(/^Suggestion:\s*/i, "") : null;
    if (note) noted = true;
    blocks.push({ kind: "answered", key: q.key, title: q.text, value: edits[q.key] ?? (u?.understood?.trim() || capital(own)), raw: own, polished: !!u?.understood?.trim(), note });
  });
  return blocks;
}

/**
 * The POST /api/invitations/:token/team body, as TeamFlow sends it: the request version, the
 * acknowledgement, and the per-question fields from toSubmission (the same combined `text`).
 * Null when there is nothing to send (no answer and no note).
 */
export function submitBody(
  version: number,
  questions: readonly HandsFreeQuestion[],
  answers: readonly (CardAnswer | null)[],
  understood: readonly UnderstoodAnswer[] | null | undefined,
  edits: Partial<Record<QuestionKey, string>>,
): ({ expectedVersion: number; acknowledged: true } & HandsFreeSubmission) | null {
  const submission = toSubmission(questions, answers, understood, edits);
  if (!hasSomethingToSend(submission)) return null;
  return { expectedVersion: version, acknowledged: true, ...submission };
}

/** A failed send: network trouble and server errors keep the answers for Try again; a refusal says why. */
export function sendFailure(e: unknown): { retry: boolean; message: string } {
  const err = e as { status?: number; message?: string } | null;
  const status = typeof err?.status === "number" ? err.status : 0;
  if (!status || status >= 500 || status === 429) return { retry: true, message: "Your answers are safe on this device. Check your connection and try again." };
  return { retry: false, message: err?.message || "The answers could not be sent." };
}

/* ── Keyboard ────────────────────────────────────────────────────────────── */

export type KeyAction = "togglePause" | "prev" | "skip" | "typeInstead" | "next" | "close";

export type KeyContext = {
  key: string;
  /** Ctrl, Alt or Meta held: never a shortcut. */
  modifier: boolean;
  shift: boolean;
  /** Focus is in a text field (input, textarea, select, contenteditable). */
  inText: boolean;
  /** Focus is on a button or link, where Space and Enter press it. */
  onControl: boolean;
  /** The typing box has focus. */
  inTypingBox: boolean;
  typing: boolean;
  sheetOpen: boolean;
};

/** The shortcuts of §9.3. Enter in the typing box is Next; Shift+Enter is a new line. */
export function keyAction(c: KeyContext): KeyAction | null {
  if (c.modifier) return null;
  if (c.key === "Escape") return c.sheetOpen ? "close" : null;
  if (c.sheetOpen) return null;
  // Enter is Next: in the typing box while typing; anywhere but a button or a field on a spoken card.
  if (c.key === "Enter") return c.shift ? null : c.typing ? (c.inTypingBox ? "next" : null) : c.onControl || c.inText ? null : "next";
  if (c.inText || c.shift) return null;
  if (c.key === " " || c.key === "Spacebar") return c.onControl || c.typing ? null : "togglePause";
  if (c.key === "ArrowLeft") return "prev";
  if (c.key === "s" || c.key === "S") return "skip";
  if (c.key === "t" || c.key === "T") return c.typing ? null : "typeInstead";
  return null;
}

/**
 * How many physical microphones there are. Chrome lists "default" and "communications" next to the
 * real devices (Android lists one device several times), and devices have no ids before the page
 * may use the microphone. Only a real choice of two or more is worth a stop before the cards.
 */
export function physicalMicCount(devices: ArrayLike<{ kind: string; deviceId: string; groupId?: string }>) {
  const seen = new Set<string>();
  for (const d of Array.from(devices)) {
    if (d.kind !== "audioinput" || !d.deviceId || d.deviceId === "default" || d.deviceId === "communications") continue;
    seen.add(d.groupId || d.deviceId);
  }
  return seen.size;
}

export const SHORTCUTS: [string, string][] = [
  ["Space", "Pause or resume"],
  ["←", "Previous card"],
  ["S", "Skip this one"],
  ["T", "Type instead"],
  ["Enter", "Next"],
  ["Esc", "Close the sheet"],
];

/* ── Copy ────────────────────────────────────────────────────────────────── */

export const firstName = (name: string | null | undefined) => (name || "").trim().split(/\s+/)[0] || "";

/** "6 quick questions about your work". */
export const introTitle = (n: number) => `${n} quick ${n === 1 ? "question" : "questions"} about your work`;

/** "About 3 minutes". */
export function minutesLabel(minutes: number) {
  const m = Math.max(1, Math.round(minutes));
  return `About ${m} ${m === 1 ? "minute" : "minutes"}`;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Due Fri", "Due today", "Due 9 Oct", or "" without a date. `dueDate` is YYYY-MM-DD. */
export function dueShort(dueDate: string | undefined, now: Date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dueDate || "");
  if (!m) return "";
  const due = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return "Past due";
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days < 7) return `Due ${DAYS[due.getDay()]}`;
  return `Due ${due.getDate()} ${MONTHS[due.getMonth()]}`;
}

/** "That took about 2 minutes." */
export function tookLabel(ms: number) {
  const m = Math.max(1, Math.round(ms / 60_000));
  return `That took about ${m} ${m === 1 ? "minute" : "minutes"}.`;
}

/** The caption shows the last words only (prototype: 16 words). */
export function captionTail(text: string, words = 16) {
  const w = text.trim().split(/\s+/).filter(Boolean);
  return w.length > words ? `…${w.slice(-words).join(" ")}` : w.join(" ");
}

/** "You said: …" on a past card (prototype: 170 characters). */
export function youSaid(raw: string) {
  const t = raw.trim();
  if (!t) return "Nothing yet.";
  return t.length > 170 ? `${t.slice(0, 168)}…` : t;
}

/** The privacy lines (spec §9.3, exact): consent screen and Why sheet. */
export const privacyLines = (advisorFirst: string) => [
  "Your words are transcribed securely while you speak so the cards can follow along.",
  `Nothing goes to ${advisorFirst || "your advisor"} until you review it and tap Send.`,
];

/**
 * Which service turns speech into text, for the Why sheet. Null before the deck picked one (the
 * intro): both are named, as each may be used.
 */
/**
 * The recorded backup in the privacy copy (October 19): a spoken answer is recorded on the device
 * while the card listens, and kept only when its live words dropped out, until it is text.
 */
export function backupPrivacyLine(serverTranscribes: boolean) {
  return serverTranscribes
    ? "If the live words drop out (no signal, for example), this device keeps a recording of that answer until it is sent to OpenAI to turn it into text. Only the text is kept."
    : "If the live words drop out (no signal, for example), this device keeps a recording of that answer and turns it into text itself. Only the text is kept.";
}

export function speechServiceLine(kind: SpeechSourceKind | null) {
  if (kind === "openai") return "Voice answers use OpenAI's transcription service to turn your speech into text. DutyGraph keeps the text, not the audio.";
  if (kind === "browser")
    return "Voice answers use your browser's speech service to turn your speech into text. In Chrome, this is Google's speech service. DutyGraph keeps the text, not the audio.";
  if (kind === "none") return "Voice answers are not available in this browser. You can type your answers.";
  return "Voice answers use OpenAI's transcription service, or your browser's speech service when that is not available, to turn your speech into text. DutyGraph keeps the text, not the audio.";
}
