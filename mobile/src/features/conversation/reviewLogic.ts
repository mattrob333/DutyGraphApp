/**
 * Pure review-screen logic (PRD 20, 21). The participant's edits live in a
 * local copy of the server's proposed items; what is submitted is that
 * reviewed copy, never the original interpretation.
 */
import type { Id, InterpretationItem, SubmitInput } from '@/types/domain';

/** The wording that counts: the participant's own if they changed it. */
export function effectiveText(item: InterpretationItem): string {
  return item.status === 'CHANGED' && item.participantEditedText?.trim() ? item.participantEditedText.trim() : item.proposedText;
}

export function confirmItem(items: InterpretationItem[], id: Id): InterpretationItem[] {
  return items.map((i) => (i.id === id && i.allowedActions.includes('CONFIRM') ? { ...i, status: 'CONFIRMED' } : i));
}

export function changeItemWording(items: InterpretationItem[], id: Id, text: string): InterpretationItem[] {
  const t = text.trim();
  if (!t) return items;
  return items.map((i) => (i.id === id && (i.allowedActions.includes('CHANGE') || i.addedByParticipant) ? { ...i, status: 'CHANGED', participantEditedText: t } : i));
}

/** A participant-added item ("Add something we missed"): their words, already reviewed by definition. */
export function newParticipantItem(sessionId: Id, id: Id, text: string): InterpretationItem {
  return {
    id,
    sessionId,
    category: 'OTHER',
    label: 'Added by you',
    proposedText: text.trim(),
    participantEditedText: text.trim(),
    status: 'CHANGED',
    sourceUtteranceIds: [],
    allowedActions: ['CONFIRM', 'CHANGE'],
    addedByParticipant: true,
  };
}

/** Items the participant has acted on. Unchecked cards do not block submitting. */
export function checkedCount(items: InterpretationItem[]): number {
  return items.filter((i) => i.status !== 'PENDING').length;
}

export function reviewSummary(items: InterpretationItem[]) {
  return {
    total: items.length,
    confirmed: items.filter((i) => i.status === 'CONFIRMED').length,
    changed: items.filter((i) => i.status === 'CHANGED').length,
    unchecked: items.filter((i) => i.status === 'PENDING').length,
  };
}

/** Body of the submit call. Items go as reviewed: unchecked stay PENDING for the server to decide. */
export function buildSubmitInput(sessionId: Id, idempotencyKey: string, items: InterpretationItem[]): SubmitInput {
  return { sessionId, idempotencyKey, items: items.map((i) => ({ ...i })) };
}
