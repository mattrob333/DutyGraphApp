/**
 * Hands-free answers waiting for the server (PRD 27, as src/features/conversation/pendingSync.ts
 * does for conversations). `HttpCompanionRepository.submitAnswers` writes the submission and its
 * Idempotency-Key to secure storage before the first attempt and removes it once the server
 * acknowledges it. A retry, from the Send failed screen or `syncPendingAnswers`, reuses the saved
 * key, so it can never create a second response.
 */
import type { CompanionRepository } from '../repository';
import { CompanionApiError } from '@/types/domain';
import type { HandsFreeSubmission, SubmitAnswersInput, SubmitAnswersResult } from '@/types/handsfree';
import { secureDelete, secureGetJson, secureSetJson } from '@/storage/secure';

export interface PendingAnswers {
  requestId: string;
  idempotencyKey: string;
  expectedVersion: number;
  contentHash: string;
  submission: HandsFreeSubmission;
  savedAt: string;
  attempts: number;
}

const INDEX = 'dg.companion.hfpending.index';
const keyFor = (requestId: string) => `dg.companion.hfpending.${requestId}`;

async function readIndex(): Promise<string[]> {
  return (await secureGetJson<string[]>(INDEX)) ?? [];
}

export const pendingAnswers = {
  async save(p: PendingAnswers): Promise<void> {
    await secureSetJson(keyFor(p.requestId), p);
    const idx = await readIndex();
    if (!idx.includes(p.requestId)) await secureSetJson(INDEX, [...idx, p.requestId]);
  },
  get: (requestId: string) => secureGetJson<PendingAnswers>(keyFor(requestId)),
  async list(): Promise<PendingAnswers[]> {
    const out: PendingAnswers[] = [];
    for (const id of await readIndex()) {
      const p = await secureGetJson<PendingAnswers>(keyFor(id));
      if (p) out.push(p);
    }
    return out;
  },
  async remove(requestId: string): Promise<void> {
    await secureDelete(keyFor(requestId));
    const idx = await readIndex();
    await secureSetJson(INDEX, idx.filter((i) => i !== requestId));
  },
  /** Logout: the words are the participant's own and leave the device with their session. */
  async clear(): Promise<void> {
    for (const id of await readIndex()) await secureDelete(keyFor(id));
    await secureDelete(INDEX);
  },
};

/** The same answers for the same request version: a retry, which must reuse the first key. */
export function sameAnswers(p: PendingAnswers, input: Omit<SubmitAnswersInput, 'idempotencyKey'>): boolean {
  return (
    p.requestId === input.requestId &&
    p.expectedVersion === input.expectedVersion &&
    p.contentHash === input.contentHash &&
    JSON.stringify(p.submission) === JSON.stringify(input.submission)
  );
}

/**
 * Errors that mean this saved submission can never succeed: closed, gone, changed (409), or a
 * body the server refuses (400, 422). Rate limits, outages and lost connections are retried.
 */
export function isTerminalAnswersError(e: unknown): boolean {
  return e instanceof CompanionApiError && !e.retryable && [400, 403, 404, 409, 410, 422].includes(e.status);
}

export interface AnswersSyncOutcome {
  sent: { pending: PendingAnswers; result: SubmitAnswersResult }[];
  failed: string[];
  dropped: string[];
}

let running = false;

/** Retries every saved submission with its own key (app start, back online). */
export async function syncPendingAnswers(repo: Pick<CompanionRepository, 'submitAnswers'>): Promise<AnswersSyncOutcome> {
  const outcome: AnswersSyncOutcome = { sent: [], failed: [], dropped: [] };
  if (running) return outcome;
  running = true;
  try {
    for (const p of await pendingAnswers.list()) {
      try {
        const result = await repo.submitAnswers({
          requestId: p.requestId,
          idempotencyKey: p.idempotencyKey,
          expectedVersion: p.expectedVersion,
          contentHash: p.contentHash,
          submission: p.submission,
        });
        outcome.sent.push({ pending: p, result });
      } catch (e) {
        // submitAnswers already removed a terminal one and counted the attempt on the others.
        (isTerminalAnswersError(e) ? outcome.dropped : outcome.failed).push(p.requestId);
      }
    }
  } finally {
    running = false;
  }
  return outcome;
}
