/**
 * Hands-free question cards (docs/specs/COMPANION-HANDS-FREE.md). The types every side shares:
 * the server builds questions with hints, the app and (later) the web page run the deck on them,
 * and the submission goes back in the same per-question shape the web team page already sends.
 *
 * This folder is imported by the Expo app as well as the server and the web client, so it stays
 * pure TypeScript: no imports from outside `shared/hands-free/`, no zod, no Node or DOM APIs.
 */

/** The web page's key for question N (0-based): `question.0`, `question.1`, … */
export type QuestionKey = `question.${number}`;

/** One "Try to cover" chip. `cues` are lower-case words or short phrases the local check looks for. */
export type QuestionHint = {
  /** Stable within its question: `h0`, `h1`, `h2`. */
  id: string;
  /** The chip text, e.g. "Who gets it next". At most 40 characters. */
  label: string;
  /** The violet line shown when this chip is still missing, e.g. "…and who picks it up after you?". */
  nudge: string;
  cues: string[];
};

export type HandsFreeQuestion = {
  key: QuestionKey;
  index: number;
  /** The full question shown on the card. */
  text: string;
  /** The short title for the intro list and the review, e.g. "Your tools". */
  short: string;
  /** 0 to 3 chips. Zero only on the "Anything else?" card. */
  hints: QuestionHint[];
  /** The optional last card. It is not one of the advisor's questions and is not counted in "N questions". */
  isElse?: boolean;
};

/** How a card ended. `saved` = moved on after the nudge ceiling with what was said. */
export type CardStatus = "got" | "saved" | "skipped";

/** Matches the prototype's skip sheet. `dontknow` and `someone` map to the web's `unknown` and `wrong_role`. */
export type SkipReason = "skip" | "dontknow" | "someone";

/**
 * How a card's words were spoken: the names of shared/answer-sources.ts (kept here as literals,
 * because this folder imports nothing): OpenAI live transcription on the web, the browser's own live
 * speech recognition on the web, or the phone's own speech recognizer in the Companion app.
 */
export type HandsFreeVoiceVia = "voice_openai" | "voice_browser" | "voice_device";

/** Where a card's words came from: the speech service that wrote them, and whether the person typed. */
export type CardInput = { voice?: HandsFreeVoiceVia; typed?: boolean };

export type CardAnswer = {
  status: CardStatus;
  /** The person's own words for this card (captions joined, or typed). Empty for a skip with nothing said. */
  raw: string;
  /** Hint ids heard. */
  covered: string[];
  reason?: SkipReason;
  /** Where the words came from. Absent on answers saved before it was recorded. */
  input?: CardInput;
};

/** One answer's source as POST /api/invitations/:token/team takes it (shared/answer-sources.ts). */
export type HandsFreeAnswerSource = { via: "typed" | HandsFreeVoiceVia; edited?: boolean };

/** The result of one "is this enough?" check, from the local heuristic or the server. */
export type CoverageResult = {
  /** Hint ids now covered (a superset of what the caller already had is fine). */
  covered: string[];
  /** One short follow-up for the first missing hint, or null. */
  nudge: string | null;
  /** Which check answered. */
  source: "local" | "server";
};

/** One polished answer for "Here's what we heard" (same shape as shared/participant-understand.ts). */
export type UnderstoodAnswer = { key: QuestionKey; understood: string; suggestion: string | null };

/**
 * What the app sends on submit. The same fields as POST /api/invitations/:token/team, so the
 * advisor, the fill loop and the Repo see a phone answer exactly like a web answer.
 */
export type HandsFreeSubmission = {
  /** Every question with the person's words, in the web page's combined format. */
  text: string;
  questionAnswers?: Partial<Record<QuestionKey, string>>;
  questionUnderstood?: Partial<Record<QuestionKey, string>>;
  questionSuggestions?: Partial<Record<QuestionKey, string>>;
  questionResponses?: Partial<Record<QuestionKey, "unknown" | "wrong_role">>;
  /** Where each answer's words came from, so the advisor's review says which were transcribed. */
  questionAnswerSources?: Partial<Record<QuestionKey, HandsFreeAnswerSource>>;
  /** The "Anything else?" note on its own. */
  responseText?: string;
};
