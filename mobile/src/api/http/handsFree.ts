/**
 * Contract 1.2 mapping for the hands-free question cards (docs/specs/COMPANION-HANDS-FREE.md §4,
 * docs/companion-mobile-api.md). The 1.2 fields are optional in the contract, so a 1.1 server
 * still works: its questions get their hints from the local table (`buildQuestions`).
 *
 * No React Native here and relative imports only: the server test (tests/mobile-hands-free.test.ts)
 * imports these mappers and body builders to post exactly what the app sends.
 */
import { buildQuestions, minutesFor, type StoredQuestionHints } from '../../../../shared/hands-free/hints';
import { nudgeFor } from '../../../../shared/hands-free/coverage';
import type { CoverageCheckInput, QuestionHint, QuestionKey, QuestionSet, ServerCoverage, SubmitAnswersInput, UnderstandInput, UnderstandResult, UnderstoodAnswer } from '../../types/handsfree';
import type { components } from '../generated/companion-mobile-v1';

type S = components['schemas'];
export type QuestionDetailDto = S['ParticipantRequestDetail'];
export type CoverageDto = S['CoverageResult'];
export type UnderstandDto = S['UnderstandAnswersResult'];

/** The server limits (shared/mobile-contracts.ts answerCoverageBody, shared/participant-understand.ts). */
export const COVERAGE_TEXT_MAX = 4000;
export const UNDERSTAND_LIMITS = { answers: 12, question: 300, text: 4000, suggestion: 400 } as const;
const KEY = /^question\.\d+$/;

/**
 * "Why am I being asked this?" for a real request. Accurate privacy copy (spec §1): words are
 * processed while the person speaks; nothing goes to the advisor until they tap Send.
 */
export function whyAskedFor(d: QuestionDetailDto, companyName: string, advisorName: string): string[] {
  const first = advisorName.split(/\s+/)[0] || '';
  const intro =
    d.noticePreview?.trim() ||
    (d.notice ? d.notice.trim().slice(0, 500) : '') ||
    `${companyName || 'Your company'} is working with ${advisorName || 'your advisor'} to understand how work really moves between people and tools.`;
  return [
    intro,
    `${first || 'Your advisor'} sends each person a few questions about their own work. There are no right or wrong answers.`,
    `Your words are processed securely while you speak so DutyGraph can follow along. Nothing goes to ${first || 'your advisor'} until you review it and tap Send.`,
  ];
}

/** GET /requests/{requestId} → the deck's questions, with the "Anything else?" card added last. */
export function mapQuestionSet(d: QuestionDetailDto, companyName: string): QuestionSet {
  const advisorName = (d.advisorName ?? '').trim();
  const stored: StoredQuestionHints = {};
  d.questions.forEach((q, i) => {
    const key = (q.key && KEY.test(q.key) ? q.key : `question.${i}`) as QuestionKey;
    if (Array.isArray(q.hints) && q.hints.length) stored[key] = { short: q.short, hints: q.hints };
  });
  return {
    requestId: d.requestId,
    version: d.version,
    contentHash: d.contentHash,
    title: d.title,
    advisorName,
    companyName,
    dueDate: d.dueDate,
    estimatedMinutes: minutesFor(d.questions.length),
    questions: buildQuestions(
      d.questions.map((q) => q.text),
      { advisorName, stored },
    ),
    whyAsked: whyAskedFor(d, companyName, advisorName),
  };
}

/** The coverage body within the server's limit. Null when there are no words to check. */
export function coverageBody(input: Pick<CoverageCheckInput, 'questionKey' | 'text'>): S['CoverageRequest'] | null {
  const text = input.text.trim().slice(0, COVERAGE_TEXT_MAX);
  return text ? { questionKey: input.questionKey, text } : null;
}

/** Server ids filtered to the card's own hints; the nudge comes from the hint table, never the model. */
export function mapCoverage(dto: CoverageDto, hints: readonly QuestionHint[] | undefined): ServerCoverage {
  if (!dto || typeof dto !== 'object' || dto.available !== true || !Array.isArray(dto.covered)) {
    return { available: false, reason: dto && dto.available === false && typeof dto.reason === 'string' ? dto.reason : 'BAD_RESPONSE' };
  }
  const ids = dto.covered.filter((id): id is string => typeof id === 'string');
  const covered = hints ? hints.map((h) => h.id).filter((id) => ids.includes(id)) : ids;
  return { available: true, result: { covered, nudge: hints ? nudgeFor(hints, covered) : null, source: 'server' } };
}

/** The understand body within the server's limits, empty answers left out. */
export function understandBody(input: UnderstandInput): S['UnderstandAnswersRequest'] {
  return {
    answers: input.answers
      .filter((a) => KEY.test(a.key) && a.text.trim() && a.question.trim())
      .slice(0, UNDERSTAND_LIMITS.answers)
      .map((a) => ({
        key: a.key,
        question: a.question.trim().slice(0, UNDERSTAND_LIMITS.question),
        text: a.text.trim().slice(0, UNDERSTAND_LIMITS.text),
      })),
  };
}

/** Keeps only items for keys that were asked, each once, with text. A missing item shows the person's own words. */
export function mapUnderstood(dto: UnderstandDto, asked: readonly string[]): UnderstandResult {
  if (!dto || typeof dto !== 'object' || dto.available !== true || !Array.isArray(dto.items)) {
    return { available: false, reason: dto && dto.available === false && typeof dto.reason === 'string' ? dto.reason : 'BAD_RESPONSE' };
  }
  const seen = new Set<string>();
  const items: UnderstoodAnswer[] = [];
  for (const it of dto.items) {
    if (!it || typeof it.key !== 'string' || !asked.includes(it.key) || seen.has(it.key)) continue;
    if (typeof it.understood !== 'string' || !it.understood.trim()) continue;
    seen.add(it.key);
    const suggestion = typeof it.suggestion === 'string' && it.suggestion.trim() ? it.suggestion.trim().slice(0, UNDERSTAND_LIMITS.suggestion) : null;
    items.push({ key: it.key as QuestionKey, understood: it.understood.trim(), suggestion });
  }
  return { available: true, items };
}

/**
 * POST /requests/{requestId}/submit on the words path (contract 1.1) plus the web team page's
 * per-question fields (1.2). The words were recognised on the phone and reviewed, not uploaded as
 * a clip, so the source is `typed` (no transcription job to point at).
 */
export function submitAnswersBody(input: Pick<SubmitAnswersInput, 'expectedVersion' | 'contentHash' | 'submission'>) {
  const s = input.submission;
  return {
    expectedVersion: input.expectedVersion,
    contentHash: input.contentHash,
    participantConfirmed: true as const,
    text: s.text,
    source: 'typed' as const,
    understanding: null,
    understandingUnavailable: true as const,
    ...(s.questionAnswers ? { questionAnswers: s.questionAnswers } : {}),
    ...(s.questionUnderstood ? { questionUnderstood: s.questionUnderstood } : {}),
    ...(s.questionSuggestions ? { questionSuggestions: s.questionSuggestions } : {}),
    ...(s.questionResponses ? { questionResponses: s.questionResponses } : {}),
    ...(s.responseText ? { responseText: s.responseText } : {}),
    // v1.3: where each answer's words came from (the phone's recognizer, or typed), for the advisor's review.
    ...(s.questionAnswerSources ? { questionAnswerSources: s.questionAnswerSources } : {}),
    attestation: { requestContentHash: input.contentHash },
  };
}
