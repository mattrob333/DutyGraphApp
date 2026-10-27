jest.mock('expo-secure-store', () => {
  const { secureMap } = require('../testUtils');
  return {
    AFTER_FIRST_UNLOCK: 1,
    getItemAsync: async (k: string) => secureMap.get(k) ?? null,
    setItemAsync: async (k: string, v: string) => void secureMap.set(k, v),
    deleteItemAsync: async (k: string) => void secureMap.delete(k),
  };
});

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { toSubmission } from '@shared/hands-free/submission';
import { loadDraft, newDraft, saveDraft, useDraftStore } from '@/features/handsfree/draft';
import { tokenStore } from '@/storage/tokens';
import type { CardAnswer, QuestionSet } from '@/types/handsfree';
import { answerCoverageBody, mobileSubmitBody } from '../../../../../shared/mobile-contracts';
import { understandRequestSchema } from '../../../../../shared/participant-understand';
import { HttpCompanionRepository } from '../HttpCompanionRepository';
import { pendingAnswers, syncPendingAnswers } from '../pendingAnswers';
import { REQ_HASH, REQ_ID, detailDto, makeFetch, newClient, profileDto, secureMap, sessionDto, type Handler } from '../testUtils';

const NOW = new Date(2026, 9, 9, 10, 0, 0);
const err = (status: number, code: string, retryable = false) => ({ status, body: { code, message: code, retryable, requestId: 'rq' } });
const RESPONSE_ID = '99999999-9999-4999-8999-999999999999';

const hint = (id: string, label: string) => ({ id, label, nudge: `…${label.toLowerCase()}?`, cues: [label.toLowerCase()] });
const detail12 = (over: Record<string, unknown> = {}) =>
  detailDto({
    questions: [
      { questionId: 'q1', text: 'What do you do first when a truck is late?', key: 'question.0', short: 'When a truck is late', hints: [hint('h0', 'First step'), hint('h1', 'Who you tell')] },
      { questionId: 'q2', text: 'Which tools do you use for that, and for which step?', key: 'question.1', short: 'Your tools', hints: [hint('h0', 'The tools')] },
    ],
    advisorName: 'Alex Rivera',
    ...over,
  });

function setup(handler: Handler) {
  const { fetch, calls } = makeFetch((c, n) => {
    if (c.path === '/me') return { status: 200, body: { ...profileDto, companyName: 'Cobalt' } };
    return handler(c, n);
  });
  let k = 0;
  const repo = new HttpCompanionRepository(newClient(fetch), () => NOW, () => `gen-key-${++k}`);
  return { repo, calls };
}

beforeEach(async () => {
  secureMap.clear();
  const s = sessionDto(1);
  await tokenStore.set({ accessToken: s.accessToken, refreshToken: s.refreshToken, accessExpiresAt: s.accessTokenExpiresAt });
});

describe('getQuestionSet', () => {
  it('maps the 1.2 detail: server hints, advisor, minutes, and the "Anything else?" card', async () => {
    const { repo } = setup(() => ({ status: 200, body: detail12() }));
    const set = await repo.getQuestionSet(REQ_ID);
    expect(set).toMatchObject({ requestId: REQ_ID, version: 3, contentHash: REQ_HASH, advisorName: 'Alex Rivera', companyName: 'Cobalt', dueDate: '2026-10-02', estimatedMinutes: 1 });
    expect(set.questions.map((q) => q.key)).toEqual(['question.0', 'question.1', 'question.2']);
    expect(set.questions[0]).toMatchObject({ short: 'When a truck is late', hints: [{ id: 'h0', label: 'First step' }, { id: 'h1', label: 'Who you tell' }] });
    expect(set.questions[2]).toMatchObject({ isElse: true, text: 'Anything else Alex should know about your work?' });
    expect(set.whyAsked[2]).toBe('Your words are processed securely while you speak so DutyGraph can follow along. Nothing goes to Alex until you review it and tap Send.');
  });

  it('falls back to the local hint table for a 1.1 server', async () => {
    const { repo } = setup(() => ({ status: 200, body: detailDto({ questions: [{ questionId: 'q1', text: 'Which tools do you use for that, and for which step?' }] }) }));
    const set = await repo.getQuestionSet(REQ_ID);
    expect(set.advisorName).toBe('');
    expect(set.questions[0].hints.map((h) => h.label)).toEqual(['The tools', 'Which step each one is for']);
    expect(set.questions[1].text).toBe('Anything else your advisor should know about your work?');
  });

  it('refuses closed, leadership and confirmation requests', async () => {
    for (const [over, code] of [
      [{ needsYou: false, state: 'returned' }, 'REQUEST_CLOSED'],
      [{ type: 'leadership' }, 'USE_WEB_LINK'],
      [{ type: 'confirmation', questions: [] }, 'NO_QUESTIONS'],
    ] as const) {
      const { repo } = setup(() => ({ status: 200, body: detail12(over) }));
      await expect(repo.getQuestionSet(REQ_ID)).rejects.toMatchObject({ code });
    }
  });
});

describe('checkCoverage', () => {
  async function loaded(handler: Handler) {
    const s = setup((c, n) => (c.method === 'GET' ? { status: 200, body: detail12() } : handler(c, n)));
    await s.repo.getQuestionSet(REQ_ID);
    return s;
  }

  it('posts a valid body without an Idempotency-Key and keeps only the card\'s hint ids', async () => {
    const { repo, calls } = await loaded(() => ({ status: 200, body: { available: true, covered: ['h1', 'h9', 'h0'] } }));
    const res = await repo.checkCoverage({ requestId: REQ_ID, questionKey: 'question.0', text: '  I call the carrier and tell dispatch.  ' });
    expect(res).toEqual({ available: true, result: { covered: ['h0', 'h1'], nudge: null, source: 'server' } });
    const call = calls.find((c) => c.path === `/requests/${REQ_ID}/coverage`)!;
    expect(call.method).toBe('POST');
    expect(answerCoverageBody.parse(call.json)).toEqual({ questionKey: 'question.0', text: 'I call the carrier and tell dispatch.' });
    expect(call.headers['Idempotency-Key']).toBeUndefined();
  });

  it('gives the hint table\'s nudge for the first missing hint', async () => {
    const { repo } = await loaded(() => ({ status: 200, body: { available: true, covered: ['h0'] } }));
    expect(await repo.checkCoverage({ requestId: REQ_ID, questionKey: 'question.0', text: 'I call them.' })).toEqual({
      available: true,
      result: { covered: ['h0'], nudge: '…who you tell?', source: 'server' },
    });
  });

  it('never throws: 501, 503, 429, 410, network loss and odd replies are available false', async () => {
    const replies = [err(501, 'COVERAGE_NOT_CONFIGURED'), err(503, 'PROVIDER_UNAVAILABLE', true), err(429, 'RATE_LIMITED', true), err(410, 'REQUEST_CLOSED')];
    for (const reply of replies) {
      const { repo } = await loaded(() => reply);
      expect(await repo.checkCoverage({ requestId: REQ_ID, questionKey: 'question.0', text: 'words' })).toEqual({ available: false, reason: reply.body.code });
    }
    const { repo } = await loaded(() => {
      throw new TypeError('Network request failed');
    });
    expect(await repo.checkCoverage({ requestId: REQ_ID, questionKey: 'question.0', text: 'words' })).toEqual({ available: false, reason: 'NETWORK_OFFLINE' });
    const odd = await loaded(() => ({ status: 200, body: { available: false, reason: 'AI_NOT_CONNECTED' } }));
    expect(await odd.repo.checkCoverage({ requestId: REQ_ID, questionKey: 'question.0', text: 'words' })).toEqual({ available: false, reason: 'AI_NOT_CONNECTED' });
    const empty = await loaded(() => ({ status: 200, body: {} }));
    expect(await empty.repo.checkCoverage({ requestId: REQ_ID, questionKey: 'question.0', text: 'words' })).toEqual({ available: false, reason: 'BAD_RESPONSE' });
  });

  it('does not call the server with no words', async () => {
    const { repo, calls } = await loaded(() => ({ status: 200, body: { available: true, covered: [] } }));
    expect(await repo.checkCoverage({ requestId: REQ_ID, questionKey: 'question.0', text: '   ' })).toEqual({ available: false, reason: 'NO_WORDS' });
    expect(calls.some((c) => c.path.endsWith('/coverage'))).toBe(false);
  });
});

describe('understandAnswers', () => {
  it('posts the web team page\'s body and keeps only asked keys', async () => {
    const { repo, calls } = setup(() => ({
      status: 200,
      body: {
        available: true,
        items: [
          { key: 'question.0', understood: 'I call the carrier first.', suggestion: null },
          { key: 'question.0', understood: 'duplicate', suggestion: null },
          { key: 'question.5', understood: 'not asked', suggestion: null },
          { key: 'question.1', understood: 'Outlook and Excel.', suggestion: 'Suggestion: use one list.' },
        ],
      },
    }));
    const res = await repo.understandAnswers({
      requestId: REQ_ID,
      answers: [
        { key: 'question.0', question: 'What first?', text: ' I call the carrier first ' },
        { key: 'question.1', question: 'Which tools?', text: 'outlook and excel' },
        { key: 'question.2', question: 'Anything else?', text: '   ' },
      ],
    });
    expect(res).toEqual({
      available: true,
      items: [
        { key: 'question.0', understood: 'I call the carrier first.', suggestion: null },
        { key: 'question.1', understood: 'Outlook and Excel.', suggestion: 'Suggestion: use one list.' },
      ],
    });
    const call = calls.find((c) => c.path === `/requests/${REQ_ID}/understand`)!;
    expect(understandRequestSchema.parse(call.json).answers.map((a) => a.key)).toEqual(['question.0', 'question.1']);
  });

  it('shows the person\'s own words when the server cannot polish them', async () => {
    for (const reply of [err(501, 'UNDERSTAND_NOT_CONFIGURED'), err(429, 'RATE_LIMITED', true), err(503, 'PROVIDER_UNAVAILABLE', true)]) {
      const { repo } = setup(() => reply);
      expect(await repo.understandAnswers({ requestId: REQ_ID, answers: [{ key: 'question.0', question: 'Q?', text: 'words' }] })).toEqual({
        available: false,
        reason: reply.body.code,
      });
    }
    const { repo } = setup(() => ({ status: 200, body: { available: false, reason: 'AI_NOT_CONNECTED' } }));
    expect(await repo.understandAnswers({ requestId: REQ_ID, answers: [{ key: 'question.0', question: 'Q?', text: 'words' }] })).toEqual({ available: false, reason: 'AI_NOT_CONNECTED' });
  });
});

describe('submitAnswers', () => {
  const answers: (CardAnswer | null)[] = [
    { status: 'got', raw: 'I call the carrier first.', covered: ['h0'] },
    { status: 'skipped', raw: '', covered: [], reason: 'dontknow' },
    { status: 'got', raw: 'Fridays are busy.', covered: [] },
  ];
  async function input(repo: HttpCompanionRepository, key = 'send-key-1') {
    const set: QuestionSet = await repo.getQuestionSet(REQ_ID);
    const understood = [{ key: 'question.0' as const, understood: 'I call the carrier first.', suggestion: 'Suggestion: keep the carrier numbers in one place.' }];
    return { requestId: REQ_ID, idempotencyKey: key, expectedVersion: set.version, contentHash: set.contentHash, submission: toSubmission(set.questions, answers, understood) };
  }
  const submitted = { status: 200, body: { responseId: RESPONSE_ID, requestId: REQ_ID, requestState: 'returned', version: 4, idempotentReplay: false, reconciliation: {}, reviewState: 'words_unreviewed' } };

  it('1.3: sends where each answer\'s words came from, and the server schema takes it', async () => {
    const { repo, calls } = setup(async (c) => (c.method === 'GET' ? { status: 200, body: detail12() } : submitted));
    const set: QuestionSet = await repo.getQuestionSet(REQ_ID);
    const spoken: (CardAnswer | null)[] = [
      { status: 'got', raw: 'I call the carrier first.', covered: [], input: { voice: 'voice_device' } },
      { status: 'got', raw: 'Outlook and Excel.', covered: [], input: { voice: 'voice_device', typed: true } },
    ];
    const submission = toSubmission(set.questions, spoken);
    await repo.submitAnswers({ requestId: REQ_ID, idempotencyKey: 'send-sources', expectedVersion: set.version, contentHash: set.contentHash, submission });
    const call = calls.find((c) => c.path === `/requests/${REQ_ID}/submit`)!;
    expect(mobileSubmitBody.parse(call.json).questionAnswerSources).toEqual({
      'question.0': { via: 'voice_device' },
      'question.1': { via: 'voice_device', edited: true },
    });
  });

  it('sends the words path with per-question fields, the key, version and hash, saved first and cleared after', async () => {
    let pendingDuringSend: unknown = null;
    const { repo, calls } = setup(async (c) => {
      if (c.method === 'GET') return { status: 200, body: detail12() };
      pendingDuringSend = await pendingAnswers.get(REQ_ID);
      return submitted;
    });
    const body = await input(repo);
    expect(await repo.submitAnswers(body)).toEqual({ responseId: RESPONSE_ID, requestId: REQ_ID, idempotentReplay: false });
    const call = calls.find((c) => c.path === `/requests/${REQ_ID}/submit`)!;
    expect(call.headers['Idempotency-Key']).toBe('send-key-1');
    const parsed = mobileSubmitBody.parse(call.json);
    expect(parsed).toMatchObject({
      expectedVersion: 3,
      contentHash: REQ_HASH,
      participantConfirmed: true,
      source: 'typed',
      understanding: null,
      understandingUnavailable: true,
      attestation: { requestContentHash: REQ_HASH },
      questionAnswers: { 'question.0': 'I call the carrier first.' },
      questionUnderstood: { 'question.0': 'I call the carrier first.' },
      questionSuggestions: { 'question.0': 'Suggestion: keep the carrier numbers in one place.' },
      questionResponses: { 'question.1': 'unknown' },
      responseText: 'Fridays are busy.',
    });
    expect(call.json.attestation.understandingHash).toBeUndefined();
    expect(call.json.text).toContain('Question 2: Which tools do you use for that, and for which step?\nAnswer: (I do not know yet.)');
    expect(pendingDuringSend).toMatchObject({ requestId: REQ_ID, idempotencyKey: 'send-key-1', attempts: 0 });
    expect(await pendingAnswers.get(REQ_ID)).toBeNull();
    // Today shows it as done on this device (the server sends no completion time).
    const done = JSON.parse(secureMap.get('dg.companion.done') ?? '[]');
    expect(done[0]).toMatchObject({ id: REQ_ID, title: 'How late inbound freight is handled' });
  });

  it('keeps the answers after a failure and retries them with the first key', async () => {
    let fail = true;
    const { repo, calls } = setup((c) => {
      if (c.method === 'GET') return { status: 200, body: detail12() };
      return fail ? err(503, 'PROVIDER_UNAVAILABLE', true) : submitted;
    });
    const body = await input(repo);
    await expect(repo.submitAnswers(body)).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
    expect(await pendingAnswers.get(REQ_ID)).toMatchObject({ idempotencyKey: 'send-key-1', attempts: 1 });
    fail = false;
    // The Send failed screen made a new key; the same answers still go with the first one.
    await repo.submitAnswers({ ...body, idempotencyKey: 'send-key-2' });
    const sends = calls.filter((c) => c.path.endsWith('/submit'));
    expect(sends.map((c) => c.headers['Idempotency-Key'])).toEqual(['send-key-1', 'send-key-1']);
    expect(await pendingAnswers.get(REQ_ID)).toBeNull();
  });

  it('uses the new key when the answers changed after a failure', async () => {
    let fail = true;
    const { repo, calls } = setup((c) => (c.method === 'GET' ? { status: 200, body: detail12() } : fail ? err(503, 'PROVIDER_UNAVAILABLE', true) : submitted));
    const body = await input(repo);
    await expect(repo.submitAnswers(body)).rejects.toBeTruthy();
    fail = false;
    await repo.submitAnswers({ ...body, idempotencyKey: 'send-key-2', submission: { ...body.submission, responseText: 'Edited.' } });
    expect(calls.filter((c) => c.path.endsWith('/submit')).map((c) => c.headers['Idempotency-Key'])).toEqual(['send-key-1', 'send-key-2']);
  });

  it('drops a submission the server can never accept', async () => {
    const { repo } = setup((c) => (c.method === 'GET' ? { status: 200, body: detail12() } : err(409, 'VERSION_CONFLICT')));
    await expect(repo.submitAnswers(await input(repo))).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    expect(await pendingAnswers.get(REQ_ID)).toBeNull();
  });

  it('refuses to send nothing, before saving or calling the server', async () => {
    const { repo, calls } = setup(() => ({ status: 200, body: detail12() }));
    const body = await input(repo);
    await expect(repo.submitAnswers({ ...body, submission: { text: 'Question 1: Q\nAnswer: (No answer.)' } })).rejects.toMatchObject({ code: 'NOTHING_TO_SEND' });
    expect(await pendingAnswers.get(REQ_ID)).toBeNull();
    expect(calls.some((c) => c.path.endsWith('/submit'))).toBe(false);
  });

  it('joins a second tap to the send already running', async () => {
    let release: () => void = () => {};
    const { repo, calls } = setup(async (c) => {
      if (c.method === 'GET') return { status: 200, body: detail12() };
      await new Promise<void>((r) => (release = r));
      return submitted;
    });
    const body = await input(repo);
    const a = repo.submitAnswers(body);
    const b = repo.submitAnswers({ ...body, idempotencyKey: 'send-key-2' });
    await new Promise((r) => setTimeout(r, 10));
    release();
    expect(await a).toEqual(await b);
    expect(calls.filter((c) => c.path.endsWith('/submit'))).toHaveLength(1);
  });

  it('syncPendingAnswers sends what was saved with its own key', async () => {
    let fail = true;
    const { repo, calls } = setup((c) => (c.method === 'GET' ? { status: 200, body: detail12() } : fail ? err(503, 'PROVIDER_UNAVAILABLE', true) : submitted));
    await expect(repo.submitAnswers(await input(repo))).rejects.toBeTruthy();
    fail = false;
    const outcome = await syncPendingAnswers(repo);
    expect(outcome.sent.map((s) => s.pending.requestId)).toEqual([REQ_ID]);
    expect(outcome.failed).toEqual([]);
    expect(calls.filter((c) => c.path.endsWith('/submit')).map((c) => c.headers['Idempotency-Key'])).toEqual(['send-key-1', 'send-key-1']);
    expect(await pendingAnswers.list()).toEqual([]);
  });

  it('does not restore an old pending answer when its request fails after logout', async () => {
    let finish!: (reply: { status: number; body: unknown }) => void;
    const { repo, calls } = setup(c => c.path.endsWith('/submit') ? new Promise(resolve => { finish = resolve; }) : { status: 200, body: detail12() });
    const body = await input(repo);
    const outcome = repo.submitAnswers(body).catch(e => e);
    for (let i = 0; i < 20 && !calls.some(c => c.path.endsWith('/submit')); i++) await new Promise(resolve => setTimeout(resolve, 1));
    await repo.logout();
    expect(await pendingAnswers.list()).toEqual([]);
    finish({ status: 503, body: { code: 'SUBMIT_UNAVAILABLE', message: 'Try again', retryable: true } });
    expect(await outcome).toMatchObject({ code: 'SESSION_ENDED' });
    expect(await pendingAnswers.list()).toEqual([]);
  });

  it('logout removes saved answers from the device', async () => {
    const { repo } = setup((c) => (c.method === 'GET' ? { status: 200, body: detail12() } : err(503, 'PROVIDER_UNAVAILABLE', true)));
    await expect(repo.submitAnswers(await input(repo))).rejects.toBeTruthy();
    expect(await pendingAnswers.list()).toHaveLength(1);
    await repo.logout();
    expect(await pendingAnswers.list()).toEqual([]);
  });

  it('logout removes hands-free drafts from the device and from memory', async () => {
    const { repo } = setup(() => ({ status: 200, body: detail12() }));
    const set = await repo.getQuestionSet(REQ_ID);
    await saveDraft({ ...newDraft(set, 'voice', NOW), answers: [{ status: 'got', raw: 'I call the driver.', covered: ['h0'] }, null, null] });
    expect([...secureMap.keys()].some((k) => k.startsWith('dg.companion.handsfree.'))).toBe(true);
    expect(await loadDraft(set)).not.toBeNull();
    await repo.logout();
    expect([...secureMap.keys()].filter((k) => k.startsWith('dg.companion.handsfree'))).toEqual([]);
    expect(useDraftStore.getState().drafts[REQ_ID]).toBeUndefined();
    expect(await loadDraft(set)).toBeNull();
  });
});
