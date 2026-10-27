import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { coverLocally, spokenSkip } from '@shared/hands-free/coverage';
import { buildQuestions } from '@shared/hands-free/hints';
import { toSubmission } from '@shared/hands-free/submission';
import { useSimulationStore } from '@/state/simulation';
import type { CardAnswer } from '@/types/handsfree';
import { MOCK_IDS, MockCompanionRepository } from '../MockCompanionRepository';
import { MOCK_QUESTION_REQUESTS, mockQuestionRequest } from '../handsFree';

const ID = MOCK_IDS.handsFree;

function repo(scope: 'questions' | 'full' = 'questions') {
  const r = new MockCompanionRepository({ scope });
  r.latency = 0;
  return r;
}

const got = (raw: string): CardAnswer => ({ status: 'got', raw, covered: [] });

beforeEach(() => useSimulationStore.getState().reset());
afterEach(() => useSimulationStore.getState().reset());

describe('mock question set (Cobalt, prototype HF_Q)', () => {
  it('has the prototype questions, chips and nudges, then the "Anything else?" card', async () => {
    const set = await repo().getQuestionSet(ID);
    expect(set).toMatchObject({ requestId: ID, advisorName: 'Alex Rivera', companyName: 'Cobalt', estimatedMinutes: 3 });
    expect(set.questions).toHaveLength(7);
    expect(set.questions.map((q) => q.short)).toEqual([
      'How a new order reaches you',
      'Your tools',
      'Where work waits',
      'What you check and decide',
      'Who you go to',
      'What would make it easier',
      'Anything else',
    ]);
    expect(set.questions[0].hints.map((h) => h.label)).toEqual(['Where it comes from', 'What you do first', 'Who gets it next']);
    expect(set.questions[2].hints.map((h) => h.nudge)).toEqual([
      '…where does it usually wait?',
      '…and why does it wait there?',
      '…and roughly how long does it sit?',
    ]);
    expect(set.questions[6]).toMatchObject({ key: 'question.6', isElse: true, text: 'Anything else Alex should know about your work?', hints: [] });
    expect(new Date(`${set.dueDate}T12:00:00`).getDay()).toBe(5); // due Friday
    expect(set.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('scripted answers cover every chip, and card 5 is the spoken "I don\'t know yet"', () => {
    for (const r of MOCK_QUESTION_REQUESTS.filter((x) => x.advisorName)) {
      const cards = buildQuestions(r.questions, { advisorName: r.advisorName });
      r.scripts.forEach((attempts, i) => {
        const text = attempts.flat().join(' ');
        if (r.requestId === ID && i === 4) {
          expect(spokenSkip(text)).toBe('dontknow');
          return;
        }
        expect(coverLocally(text, cards[i].hints).covered).toEqual(cards[i].hints.map((h) => h.id));
      });
    }
  });

  it('shows the question requests on Today with the /questions route, and Noah as the person', async () => {
    const r = repo();
    const feed = await r.getToday();
    expect(feed.participant.firstName).toBe('Noah');
    expect(feed.dueNow[0]).toMatchObject({ id: ID, type: 'DISCOVERY', route: `/questions/${ID}`, summary: 'From Alex Rivera · 6 questions · about 3 min' });
    expect(feed.later.find((x) => x.id === MOCK_IDS.handsFreeRecords)).toMatchObject({ route: `/questions/${MOCK_IDS.handsFreeRecords}` });
    // The north dock request belongs to the full app.
    expect([...feed.dueNow, ...feed.later].some((x) => x.id === MOCK_IDS.discoveryRequest)).toBe(false);
    const full = await repo('full').getToday();
    expect(full.participant.firstName).toBe('Dana');
    expect(full.later.find((x) => x.id === MOCK_IDS.discoveryRequest)).toMatchObject({ route: `/questions/${MOCK_IDS.discoveryRequest}` });
    await expect(repo().getQuestionSet(MOCK_IDS.discoveryRequest)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await repo('full').getQuestionSet(MOCK_IDS.discoveryRequest)).questions).toHaveLength(4);
  });
});

describe('mock coverage and understand', () => {
  it('leaves coverage to the local check', async () => {
    expect(await repo().checkCoverage({ requestId: ID, questionKey: 'question.0', text: 'Orders come in by email.' })).toEqual({ available: false, reason: 'LOCAL_ONLY' });
  });

  it('polishes the scripted words and keeps other words as said', async () => {
    const r = mockQuestionRequest(ID)!;
    const res = await repo().understandAnswers({
      requestId: ID,
      answers: [
        { key: 'question.2', question: r.questions[2], text: r.scripts[2].flat().join(' ') },
        { key: 'question.1', question: r.questions[1], text: 'we mostly use a whiteboard' },
      ],
    });
    expect(res).toEqual({
      available: true,
      items: [
        { key: 'question.2', understood: r.polished[2], suggestion: 'Small overages might be pre-approved, so fewer orders wait on Finance.' },
        { key: 'question.1', understood: 'We mostly use a whiteboard.', suggestion: null },
      ],
    });
  });

  it('is unavailable with the provider error or offline toggles', async () => {
    const input = { requestId: ID, answers: [{ key: 'question.0' as const, question: 'Q', text: 'Words' }] };
    useSimulationStore.getState().set({ providerError: true });
    expect(await repo().understandAnswers(input)).toEqual({ available: false, reason: 'PROVIDER_UNAVAILABLE' });
    useSimulationStore.getState().set({ providerError: false, offline: true });
    expect(await repo().understandAnswers(input)).toEqual({ available: false, reason: 'NETWORK_OFFLINE' });
  });
});

describe('mock submit', () => {
  async function input(r: MockCompanionRepository, key = 'key-1') {
    const set = await r.getQuestionSet(ID);
    const answers = set.questions.map((q, i) => (i === 0 ? got('Orders come in by email.') : null));
    return { requestId: ID, idempotencyKey: key, expectedVersion: set.version, contentHash: set.contentHash, submission: toSubmission(set.questions, answers) };
  }

  it('keeps where each answer\'s words came from, as the server stores it', async () => {
    const r = repo();
    const set = await r.getQuestionSet(ID);
    const answers: (CardAnswer | null)[] = set.questions.map((q, i) =>
      i === 0 ? { ...got('Orders come in by email.'), input: { voice: 'voice_device' } } : i === 1 ? { ...got('Then I check stock.'), input: { typed: true } } : null,
    );
    await r.submitAnswers({ requestId: ID, idempotencyKey: 'key-sources', expectedVersion: set.version, contentHash: set.contentHash, submission: toSubmission(set.questions, answers) });
    expect(r.sentAnswers(ID)?.questionAnswerSources).toEqual({ 'question.0': { via: 'voice_device' }, 'question.1': { via: 'typed' } });
  });

  it('is idempotent by key and moves the request to done', async () => {
    const r = repo();
    const body = await input(r);
    const first = await r.submitAnswers(body);
    expect(first).toEqual({ responseId: `resp-${ID}`, requestId: ID, idempotentReplay: false });
    expect(await r.submitAnswers(body)).toEqual({ ...first, idempotentReplay: true });
    await expect(r.submitAnswers({ ...body, idempotencyKey: 'key-2' })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT', status: 409 });
    const feed = await r.getToday();
    expect(feed.dueNow.some((x) => x.id === ID)).toBe(false);
    expect(feed.doneToday.some((x) => x.id === `done-${ID}`)).toBe(true);
    await expect(r.getQuestionSet(ID)).rejects.toMatchObject({ code: 'REQUEST_CLOSED' });
  });

  it('honours the offline and send-failure toggles, then succeeds with the same key', async () => {
    const r = repo();
    const body = await input(r);
    useSimulationStore.getState().set({ offline: true });
    await expect(r.submitAnswers(body)).rejects.toMatchObject({ code: 'NETWORK_OFFLINE', retryable: true });
    useSimulationStore.getState().set({ offline: false, failSend: true });
    await expect(r.submitAnswers(body)).rejects.toMatchObject({ code: 'SUBMIT_UNAVAILABLE', retryable: true });
    useSimulationStore.getState().set({ failSend: false });
    expect((await r.submitAnswers(body)).idempotentReplay).toBe(false);
  });

  it('holds on "Sending…" while the hold toggle is on', async () => {
    const r = repo();
    const body = await input(r);
    useSimulationStore.getState().set({ holdSend: true });
    let settled = false;
    const p = r.submitAnswers(body).then(() => (settled = true));
    await new Promise((res) => setTimeout(res, 30));
    expect(settled).toBe(false);
    useSimulationStore.getState().set({ holdSend: false });
    await p;
    expect(settled).toBe(true);
  });

  it('refuses a stale version, a changed hash and an empty submission', async () => {
    const r = repo();
    const body = await input(r);
    await expect(r.submitAnswers({ ...body, expectedVersion: 2 })).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    await expect(r.submitAnswers({ ...body, contentHash: '0'.repeat(64) })).rejects.toMatchObject({ code: 'HASH_CONFLICT' });
    await expect(r.submitAnswers({ ...body, submission: { text: 'Question 1: Q\nAnswer: (No answer.)' } })).rejects.toMatchObject({ code: 'VALIDATION_ERROR', status: 422 });
  });
});
