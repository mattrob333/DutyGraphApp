// Relative, not @shared/hands-free: the server tests import the HTTP mappers that use these types.
import type {
  CoverageResult,
  HandsFreeQuestion,
  HandsFreeSubmission,
  QuestionKey,
  UnderstoodAnswer,
} from '../../../shared/hands-free/types';

export type { CardAnswer, CardStatus, CoverageResult, HandsFreeQuestion, HandsFreeSubmission, QuestionHint, QuestionKey, SkipReason, UnderstoodAnswer } from '../../../shared/hands-free/types';

/**
 * One request's questions as the hands-free deck needs them
 * (docs/specs/COMPANION-HANDS-FREE.md §5). Built from GET /requests/{requestId} (contract 1.2).
 */
export type QuestionSet = {
  requestId: string;
  /** Send back as expectedVersion / contentHash on submit. */
  version: number;
  contentHash: string;
  title: string;
  /** "Alex Rivera". Empty when the server did not send it; screens then say "your advisor". */
  advisorName: string;
  companyName: string;
  /** ISO date (YYYY-MM-DD). */
  dueDate: string;
  /** About how long, from the question count (shared/hands-free minutesFor: about 30 s a question). */
  estimatedMinutes: number;
  /** The advisor's questions, then the "Anything else?" card (isElse). */
  questions: HandsFreeQuestion[];
  whyAsked: string[];
};

export type CoverageCheckInput = { requestId: string; questionKey: QuestionKey; text: string };

/** `available: false` means no server check (no AI connection, limit, error): use the local result. */
export type ServerCoverage = { available: true; result: CoverageResult } | { available: false; reason: string };

export type UnderstandInput = { requestId: string; answers: { key: QuestionKey; question: string; text: string }[] };

/** `available: false`: show the person's own words in the review. */
export type UnderstandResult = { available: true; items: UnderstoodAnswer[] } | { available: false; reason: string };

export type SubmitAnswersInput = {
  requestId: string;
  idempotencyKey: string;
  expectedVersion: number;
  contentHash: string;
  submission: HandsFreeSubmission;
};

export type SubmitAnswersResult = { responseId: string; requestId: string; idempotentReplay: boolean };
