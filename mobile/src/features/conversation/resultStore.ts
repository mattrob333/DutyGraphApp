/**
 * Keeps the acknowledged submit result (and what the participant did in
 * review) for the completion screen, keyed by session. In memory only: it
 * exists so the screen shown after a successful submit has the server's own
 * words; the completion screen falls back to generic copy without it.
 */
import { create } from 'zustand';
import type { SubmitResult } from '@/types/domain';
import type { reviewSummary } from './reviewLogic';

export interface StoredResult {
  result: SubmitResult;
  summary?: ReturnType<typeof reviewSummary>;
  /** Milliseconds from starting the conversation to the server acknowledgement. */
  elapsedMs?: number;
}

interface ResultState {
  results: Record<string, StoredResult>;
  put: (sessionId: string, r: StoredResult) => void;
}

export const useResultStore = create<ResultState>()((set) => ({
  results: {},
  put: (sessionId, r) => set((s) => ({ results: { ...s.results, [sessionId]: r } })),
}));
