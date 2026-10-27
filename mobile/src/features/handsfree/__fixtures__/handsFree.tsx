/**
 * Test doubles for the hands-free screens: a fixed Cobalt question set (the prototype's HF_Q), a
 * fake repository, a fake recognizer the test speaks through, and a manual clock. Fictional data.
 */
import React from 'react';
import { afterEach } from '@jest/globals';
import { act, render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { buildQuestions } from '@shared/hands-free/hints';
import { RepositoryProvider } from '@/api';
import type { CompanionRepository } from '@/api/repository';
import type { LiveSpeech, LiveSpeechHandlers, LiveSpeechKind, LiveSpeechStartOptions } from '@/features/voice/live/types';
import { ThemeProvider } from '@/theme';
import type { QuestionSet, ServerCoverage, SubmitAnswersInput, SubmitAnswersResult, UnderstandInput, UnderstandResult } from '@/types/handsfree';
import type { DeckClock } from '../useHandsFreeDeck';
import { hfKeys } from '../queries';

const clients: QueryClient[] = [];
afterEach(() => { clients.splice(0).forEach((client) => client.clear()); });

export const REQUEST_ID = 'req-test-cobalt';

export const QUESTIONS = [
  'Walk me through how a new order reaches you.',
  'Which tools do you use for that, and for which step?',
  'Where does work usually wait or get stuck?',
  'What do you check or decide yourself before passing it on?',
  'Who do you go to when something is unclear?',
  'What would make this part of your week easier?',
];

export const ANSWER_1 = {
  first: 'Most orders come in through the customer portal, and a few still arrive by email.',
  second: 'First I check stock and enter it into the order system.',
  third: 'Then it goes to the warehouse team. Usually Priya picks it up.',
};

export function questionSet(questions = QUESTIONS, over: Partial<QuestionSet> = {}): QuestionSet {
  return {
    requestId: REQUEST_ID,
    version: 3,
    contentHash: 'a'.repeat(64),
    title: 'Questions about your work',
    advisorName: 'Alex Rivera',
    companyName: 'Cobalt',
    dueDate: '2026-10-16',
    estimatedMinutes: 3,
    questions: buildQuestions(questions, { advisorName: 'Alex Rivera' }),
    whyAsked: ['Cobalt is working with Alex Rivera to understand how work really moves between people and tools.'],
    ...over,
  };
}

export class FakeRepo {
  readonly kind = 'mock' as const;
  coverage: ServerCoverage = { available: false, reason: 'LOCAL_ONLY' };
  understood: UnderstandResult = { available: false, reason: 'TEST' };
  submitError: unknown = null;
  submits: SubmitAnswersInput[] = [];
  understands: UnderstandInput[] = [];
  constructor(public set: QuestionSet = questionSet()) {}
  getQuestionSet = async () => this.set;
  checkCoverage = async () => this.coverage;
  understandAnswers = async (input: UnderstandInput) => {
    this.understands.push(input);
    return this.understood;
  };
  submitAnswers = async (input: SubmitAnswersInput): Promise<SubmitAnswersResult> => {
    this.submits.push(input);
    if (this.submitError) throw this.submitError;
    return { responseId: 'resp-1', requestId: input.requestId, idempotentReplay: false };
  };
  getMe = async () => ({ id: 'p-noah', firstName: 'Noah', displayName: 'Noah Reed' });
}

/** A recognizer the test talks through. */
export class FakeSpeech implements LiveSpeech {
  starts: LiveSpeechStartOptions[] = [];
  stops = 0;
  handlers: LiveSpeechHandlers | null = null;
  constructor(readonly kind: LiveSpeechKind = 'native') {}
  async start(options: LiveSpeechStartOptions, handlers: LiveSpeechHandlers) {
    this.starts.push(options);
    this.handlers = handlers;
  }
  async stop() {
    this.stops += 1;
    this.handlers = null;
  }
  get on() {
    return !!this.handlers;
  }
  /** The full text heard so far, as a recognizer reports it. */
  async say(text: string) {
    await act(async () => this.handlers?.onText(text));
  }
  async fail(code: 'permission_denied' | 'not_available' | 'network' | 'other') {
    await act(async () => this.handlers?.onError({ code }));
  }
}

/** Timers fire only when the test says so. */
export class ManualClock implements DeckClock {
  private seq = 0;
  timers = new Map<number, { fn: () => void; ms: number }>();
  set(fn: () => void, ms: number) {
    const id = ++this.seq;
    this.timers.set(id, { fn, ms });
    return id;
  }
  clear(h: unknown) {
    this.timers.delete(h as number);
  }
  /** The pending delays, oldest first. */
  get pending() {
    return [...this.timers.values()].map((t) => t.ms);
  }
  /** Fires the newest pending timer (or the newest with this delay), then lets effects run. */
  async fire(ms?: number) {
    const entries = [...this.timers.entries()].filter(([, t]) => ms == null || t.ms === ms);
    const last = entries[entries.length - 1];
    if (!last) throw new Error(`No pending timer${ms != null ? ` of ${ms} ms` : ''}; pending: ${this.pending.join(', ')}`);
    this.timers.delete(last[0]);
    await act(async () => last[1].fn());
    await flush();
  }
}

/** Lets pending promises (storage, repository, the microphone queue) settle inside act. */
export async function flush() {
  for (let i = 0; i < 4; i++) await act(async () => {});
}

export async function renderWithProviders(ui: React.ReactElement, repo: FakeRepo) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  clients.push(qc);
  qc.setQueryData(hfKeys.questionSet(repo.set.requestId), repo.set);
  const view = await render(
    <QueryClientProvider client={qc}>
      <RepositoryProvider repository={repo as unknown as CompanionRepository}>
        <ThemeProvider>{ui}</ThemeProvider>
      </RepositoryProvider>
    </QueryClientProvider>,
  );
  return { qc, view };
}
