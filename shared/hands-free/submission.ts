/**
 * The deck's answers as the web team page sends them (docs/specs/COMPANION-HANDS-FREE.md §3):
 * POST /api/invitations/:token/team fields, so the advisor, the fill loop and the Repo read a
 * phone answer exactly like a web answer. `text` is what client/src/sponsor/flow-model.ts
 * `teamAnswerText` produces for the same answers (tests/hands-free-submission.test.ts).
 */
import type { CardAnswer, HandsFreeAnswerSource, HandsFreeQuestion, HandsFreeSubmission, QuestionKey, SkipReason, UnderstoodAnswer } from "./types";

/** The web page's limits (shared/kickoff-preparation.ts). Longer words are cut, not refused. */
export const SUBMISSION_LIMITS = { answer: 4000, suggestion: 400, responseText: 30000 } as const;

const WEB_REASON: Partial<Record<SkipReason, "unknown" | "wrong_role">> = { dontknow: "unknown", someone: "wrong_role" };

const cut = (text: string, max: number) => text.trim().slice(0, max).trim();

/**
 * @param questions the deck's cards (the "Anything else?" card included or not)
 * @param answers one per card, same order; null for a card never answered
 * @param understood "Here's what we heard" results, when the server polished the words
 * @param edits the person's edits on the review, by key. An edit replaces the polished text, or
 *   the person's own words when there was no polished text (as the web review does).
 */
export function toSubmission(
  questions: readonly HandsFreeQuestion[],
  answers: readonly (CardAnswer | null | undefined)[],
  understood?: readonly UnderstoodAnswer[] | null,
  edits?: Partial<Record<QuestionKey, string>> | null,
): HandsFreeSubmission {
  const polished = new Map((understood || []).map((u) => [u.key, u]));
  const questionAnswers: Partial<Record<QuestionKey, string>> = {};
  const questionUnderstood: Partial<Record<QuestionKey, string>> = {};
  const questionSuggestions: Partial<Record<QuestionKey, string>> = {};
  const questionResponses: Partial<Record<QuestionKey, "unknown" | "wrong_role">> = {};
  const questionAnswerSources: Partial<Record<QuestionKey, HandsFreeAnswerSource>> = {};
  let responseText = "";
  const parts: string[] = [];

  questions.forEach((q, i) => {
    const a = answers[i];
    const edit = edits?.[q.key];
    if (q.isElse) {
      if (a && a.status !== "skipped") responseText = cut(edit ?? a.raw, SUBMISSION_LIMITS.responseText);
      return;
    }
    let line = "(No answer.)";
    if (a?.status === "skipped") {
      const why = a.reason ? WEB_REASON[a.reason] : undefined;
      if (why) {
        questionResponses[q.key] = why;
        line = why === "unknown" ? "(I do not know yet.)" : "(Someone else should answer.)";
      }
    } else if (a) {
      const p = polished.get(q.key);
      const words = cut(edit != null && !p?.understood?.trim() ? edit : a.raw, SUBMISSION_LIMITS.answer);
      if (words) {
        questionAnswers[q.key] = words;
        line = words;
        const source = answerSource(a, edit != null);
        if (source) questionAnswerSources[q.key] = source;
        const tidy = cut(edit != null && p?.understood?.trim() ? edit : p?.understood || "", SUBMISSION_LIMITS.answer);
        if (tidy) questionUnderstood[q.key] = tidy;
        const note = cut(p?.suggestion || "", SUBMISSION_LIMITS.suggestion);
        if (tidy && note) questionSuggestions[q.key] = note;
      }
    }
    parts.push(`Question ${q.index + 1}: ${q.text}\nAnswer: ${line}`);
  });
  if (responseText) parts.push(`Anything else:\n${responseText}`);

  const has = (o: object) => Object.keys(o).length > 0;
  return {
    text: parts.join("\n\n"),
    ...(has(questionAnswers) ? { questionAnswers } : {}),
    ...(has(questionUnderstood) ? { questionUnderstood } : {}),
    ...(has(questionSuggestions) ? { questionSuggestions } : {}),
    ...(has(questionResponses) ? { questionResponses } : {}),
    ...(has(questionAnswerSources) ? { questionAnswerSources } : {}),
    ...(responseText ? { responseText } : {}),
  };
}

/**
 * Where one answer's words came from, as the web interview app records it (shared/answer-sources.ts
 * noteAnswerSource): spoken words keep the speech service and are `edited` when the person also typed
 * on the card or changed them on the review; typed words are `typed`. Null for an answer saved before
 * the deck recorded its input.
 */
export function answerSource(a: CardAnswer, editedOnReview = false): HandsFreeAnswerSource | null {
  const input = a.input;
  if (input?.voice) return input.typed || editedOnReview ? { via: input.voice, edited: true } : { via: input.voice };
  return input?.typed ? { via: "typed" } : null;
}

/** True when there is something to send: at least 1 answered card or an "Anything else?" note (the web rule). */
export function hasSomethingToSend(s: HandsFreeSubmission) {
  return !!(s.questionAnswers && Object.keys(s.questionAnswers).length) || !!s.responseText;
}
