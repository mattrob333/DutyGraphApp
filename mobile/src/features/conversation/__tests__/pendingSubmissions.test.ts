import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { CompanionRepository } from '@/api/repository';
import { CompanionApiError, type InterpretationItem, type SubmitResult } from '@/types/domain';

// In-memory SecureStore so the real chunking/storage code runs.
const mockMem = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK: 0,
  getItemAsync: async (k: string) => mockMem.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => void mockMem.set(k, v),
  deleteItemAsync: async (k: string) => void mockMem.delete(k),
}));

import { pendingSubmissions, textDrafts } from '@/storage/drafts';
import { inFlightSubmissions, isTerminalSubmitError, syncPendingSubmissions } from '../pendingSync';

const item = (id: string, text = 'x'): InterpretationItem => ({
  id,
  sessionId: 's1',
  category: 'STATUS',
  label: 'Status',
  proposedText: text,
  status: 'CHANGED',
  participantEditedText: `My ${text}`,
  sourceUtteranceIds: [],
  allowedActions: ['CONFIRM', 'CHANGE'],
});
const pending = (sessionId: string, key: string) => ({ sessionId, idempotencyKey: key, items: [item('i1')], savedAt: '2026-09-29T10:00:00Z', attempts: 1 });
const ok = (sessionId: string): SubmitResult => ({ sessionId, acknowledgedAt: '2026-09-29T10:01:00Z', headline: 'Sent. Thank you.', body: 'ok' });

beforeEach(() => {
  mockMem.clear();
  inFlightSubmissions.clear();
});

describe('pending submissions storage', () => {
  it('saves, lists and removes, keeping the idempotency key', async () => {
    await pendingSubmissions.save(pending('s1', 'k1'));
    await pendingSubmissions.save(pending('s2', 'k2'));
    expect((await pendingSubmissions.list()).map((p) => [p.sessionId, p.idempotencyKey])).toEqual([
      ['s1', 'k1'],
      ['s2', 'k2'],
    ]);
    await pendingSubmissions.remove('s1');
    expect((await pendingSubmissions.list()).map((p) => p.sessionId)).toEqual(['s2']);
    expect(await pendingSubmissions.get('s1')).toBeNull();
  });

  it('saving the same session again replaces it without duplicating the index', async () => {
    await pendingSubmissions.save(pending('s1', 'k1'));
    await pendingSubmissions.save({ ...pending('s1', 'k1'), attempts: 2 });
    const all = await pendingSubmissions.list();
    expect(all).toHaveLength(1);
    expect(all[0].attempts).toBe(2);
  });

  it('round-trips large reviews across secure-store chunks', async () => {
    const big = { ...pending('s1', 'k'), items: Array.from({ length: 40 }, (_, i) => item(`i${i}`, 'long text '.repeat(20))) };
    await pendingSubmissions.save(big);
    expect((await pendingSubmissions.get('s1'))?.items).toHaveLength(40);
  });

  it('keeps and clears typed drafts', async () => {
    await textDrafts.set('s1', 'half an answer');
    expect(await textDrafts.get('s1')).toBe('half an answer');
    await textDrafts.set('s1', '');
    expect(await textDrafts.get('s1')).toBe('');
  });
});

describe('syncPendingSubmissions', () => {
  const repoWith = (submit: (i: { sessionId: string; idempotencyKey: string; items: InterpretationItem[] }) => Promise<SubmitResult>) =>
    ({ submitReview: jest.fn(submit) }) as unknown as Pick<CompanionRepository, 'submitReview'> & { submitReview: jest.Mock };

  it('retries with the saved key and reviewed items, then removes on success', async () => {
    await pendingSubmissions.save(pending('s1', 'saved-key'));
    const repo = repoWith(async (i) => ok(i.sessionId));
    const out = await syncPendingSubmissions(repo);
    expect(repo.submitReview).toHaveBeenCalledWith({ sessionId: 's1', idempotencyKey: 'saved-key', items: [item('i1')] });
    expect(out.sent).toHaveLength(1);
    expect(await pendingSubmissions.list()).toEqual([]);
  });

  it('keeps the submission (and counts the attempt) when the send fails', async () => {
    await pendingSubmissions.save(pending('s1', 'k'));
    const repo = repoWith(async () => {
      throw new CompanionApiError('NETWORK_OFFLINE', 'offline', 0, true);
    });
    const out = await syncPendingSubmissions(repo);
    expect(out.failed).toEqual(['s1']);
    const [p] = await pendingSubmissions.list();
    expect(p).toMatchObject({ sessionId: 's1', idempotencyKey: 'k', attempts: 2 });
  });

  it('drops a submission the server says can never succeed (already sent)', async () => {
    await pendingSubmissions.save(pending('s1', 'k'));
    const repo = repoWith(async () => {
      throw new CompanionApiError('IDEMPOTENCY_CONFLICT', 'already sent', 409, false);
    });
    const out = await syncPendingSubmissions(repo);
    expect(out.dropped).toEqual(['s1']);
    expect(await pendingSubmissions.list()).toEqual([]);
  });

  it('skips a session the review screen is submitting right now', async () => {
    await pendingSubmissions.save(pending('s1', 'k'));
    inFlightSubmissions.add('s1');
    const repo = repoWith(async (i) => ok(i.sessionId));
    await syncPendingSubmissions(repo);
    expect(repo.submitReview).not.toHaveBeenCalled();
    expect(await pendingSubmissions.list()).toHaveLength(1);
  });

  it('classifies terminal errors', () => {
    expect(isTerminalSubmitError(new CompanionApiError('X', 'm', 409, false))).toBe(true);
    expect(isTerminalSubmitError(new CompanionApiError('X', 'm', 503, true))).toBe(false);
    expect(isTerminalSubmitError(new CompanionApiError('X', 'm', 0, true))).toBe(false);
    expect(isTerminalSubmitError(new Error('boom'))).toBe(false);
  });
});
