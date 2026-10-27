/**
 * Retry of saved submissions (PRD 27). A pending submission is written to
 * secure storage before the first send attempt, with the idempotency key, and
 * removed only once the server acknowledges it. Retrying with the same key can
 * never create a duplicate.
 */
import type { CompanionRepository } from '@/api/repository';
import { CompanionApiError, type SubmitResult } from '@/types/domain';
import { pendingSubmissions, type PendingSubmission } from '@/storage/drafts';

/** Sessions the review screen is submitting right now; the background retry skips them. */
export const inFlightSubmissions = new Set<string>();

/** Errors that mean this saved submission can never succeed and should stop retrying. */
export function isTerminalSubmitError(e: unknown): boolean {
  return e instanceof CompanionApiError && !e.retryable && [404, 409, 410].includes(e.status);
}

export interface SyncOutcome {
  sent: { pending: PendingSubmission; result: SubmitResult }[];
  failed: string[];
  dropped: string[];
}

let running = false;

export async function syncPendingSubmissions(repo: Pick<CompanionRepository, 'submitReview'>): Promise<SyncOutcome> {
  const outcome: SyncOutcome = { sent: [], failed: [], dropped: [] };
  if (running) return outcome;
  running = true;
  try {
    for (const p of await pendingSubmissions.list()) {
      if (inFlightSubmissions.has(p.sessionId)) continue;
      inFlightSubmissions.add(p.sessionId);
      try {
        const result = await repo.submitReview({ sessionId: p.sessionId, idempotencyKey: p.idempotencyKey, items: p.items });
        await pendingSubmissions.remove(p.sessionId);
        outcome.sent.push({ pending: p, result });
      } catch (e) {
        if (isTerminalSubmitError(e)) {
          await pendingSubmissions.remove(p.sessionId);
          outcome.dropped.push(p.sessionId);
        } else {
          await pendingSubmissions.save({ ...p, attempts: p.attempts + 1 });
          outcome.failed.push(p.sessionId);
        }
      } finally {
        inFlightSubmissions.delete(p.sessionId);
      }
    }
  } finally {
    running = false;
  }
  return outcome;
}
