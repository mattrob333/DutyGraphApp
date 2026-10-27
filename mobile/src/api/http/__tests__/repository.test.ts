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
import { tokenStore } from '@/storage/tokens';
import { mobileAttestBody, mobileEnrollBody, mobileSubmitBody, mobileTranscriptionUploadMeta, mobileUnderstandingBody } from '../../../../../shared/mobile-contracts';
import { HttpCompanionRepository } from '../HttpCompanionRepository';
import {
  CARD_A,
  CARD_B,
  CONF_ID,
  JOB_ID,
  REQ_HASH,
  REQ_ID,
  UNDERSTANDING_HASH,
  detailDto,
  hex,
  makeFetch,
  newClient,
  profileDto,
  secureMap,
  sessionDto,
  type Handler,
} from '../testUtils';

const NOW = new Date(2026, 9, 1, 10, 0, 0); // local time, so day maths is TZ independent
const TOKEN = 'ab'.repeat(32);

const err = (status: number, code: string, retryable = false) => ({ status, body: { code, message: code, retryable, requestId: 'rq' } });

function setup(handler: Handler) {
  const { fetch, calls } = makeFetch((c, n) => {
    if (c.path === '/me') return { status: 200, body: profileDto };
    return handler(c, n);
  });
  let k = 0;
  const repo = new HttpCompanionRepository(newClient(fetch), () => NOW, () => `gen-key-${++k}`);
  return { repo, calls };
}

const seedTokens = () => {
  const s = sessionDto(1);
  return tokenStore.set({ accessToken: s.accessToken, refreshToken: s.refreshToken, accessExpiresAt: s.accessTokenExpiresAt });
};

beforeEach(async () => {
  secureMap.clear();
  await seedTokens();
});

const proposal = (over: Record<string, unknown> = {}) => ({
  confirmationState: 'proposed',
  summary: 's',
  tasks: [
    {
      title: 'Call the carrier',
      duty: 'Confirm a new arrival time',
      inputs: 'The bill of lading',
      instructions: 'Phone dispatch',
      output: 'A new ETA',
      handoff: 'Not stated',
      software: 'Not stated',
      missingFields: ['handoff', 'software'],
    },
  ],
  gaps: ['Who is told'],
  contentHash: UNDERSTANDING_HASH,
  idempotentReplay: false,
  job: { jobId: JOB_ID },
  ...over,
});

async function answerAll(repo: HttpCompanionRepository) {
  const s = await repo.startConversation({ requestId: REQ_ID, mode: 'DISCOVERY' });
  await repo.sendTurn({ sessionId: s.id, utteranceId: 'u1', text: 'I call the carrier.', source: 'TEXT' });
  return repo.sendTurn({ sessionId: s.id, utteranceId: 'u2', text: 'The dock supervisor, by radio.', source: 'TEXT' });
}

describe('identity', () => {
  it('enroll posts a valid body, stores the session and maps the profile', async () => {
    await tokenStore.clear();
    const { repo, calls } = setup((c) => (c.path === '/enroll' ? { status: 201, body: sessionDto(5) } : err(404, 'NOT_FOUND')));
    const me = await repo.enroll(TOKEN, 'enroll-key');
    expect(calls[0].path).toBe('/enroll');
    expect(calls[0].headers['Idempotency-Key']).toBe('enroll-key');
    expect(calls[0].headers.Authorization).toBeUndefined();
    expect(() => mobileEnrollBody.parse(calls[0].json)).not.toThrow();
    expect(calls[0].json.invitationToken).toBe(TOKEN);
    expect((await tokenStore.get())!.accessToken).toBe(sessionDto(5).accessToken);
    expect(calls[1].headers.Authorization).toBe(`Bearer ${sessionDto(5).accessToken}`);
    expect(me).toMatchObject({ id: profileDto.personId, displayName: 'Riley Sample', firstName: 'Riley', companyName: 'Northwind Demo Co', roleTitle: 'Dock Lead' });
    expect(me.notificationPreferences.pulseReady).toBe(true);
  });

  it('keeps preferences on the device and merges them into the participant', async () => {
    const { repo } = setup(() => err(404, 'NOT_FOUND'));
    await repo.getMe();
    const p = await repo.updatePreferences({ voicePreferences: { voiceFirst: true } });
    expect(p.voicePreferences.voiceFirst).toBe(true);
    expect((await repo.getMe()).voicePreferences.voiceFirst).toBe(true);
  });

  it('logout clears tokens even when the call fails', async () => {
    const { repo } = setup(() => err(503, 'X', true));
    await repo.logout();
    expect(await tokenStore.get()).toBeNull();
  });
});

describe('today', () => {
  it('maps work and confirmation requests, ignores leadership', async () => {
    const summary = (o: Record<string, unknown>) => ({ requestId: REQ_ID, version: 1, contentHash: REQ_HASH, title: 'T', type: 'work', state: 'sent', dueDate: '2026-10-02', questionCount: 3, needsYou: true, ...o });
    const { repo } = setup(() => ({
      status: 200,
      body: {
        requests: [
          summary({}),
          summary({ requestId: CONF_ID, type: 'confirmation', title: 'Check', taskCardIds: [CARD_A, CARD_B] }),
          summary({ requestId: 'lead', type: 'leadership' }),
          summary({ requestId: 'gone', state: 'accepted', needsYou: false }),
        ],
      },
    }));
    const feed = await repo.getToday();
    expect(feed.participant.firstName).toBe('Riley');
    expect(feed.dueNow).toHaveLength(2);
    const [work, conf] = feed.dueNow;
    expect(work).toMatchObject({ type: 'DISCOVERY', title: 'Answer 3 questions', cta: 'Start', route: `/questions/${REQ_ID}`, summary: 'T · about 2 min' });
    expect(new Date(work.dueAt!).getDate()).toBe(2);
    expect(conf).toMatchObject({ type: 'CONFIRMATION', cta: 'Review', route: `/confirmations/${CONF_ID}` });
    expect(feed.later).toEqual([]);
    expect(feed.doneToday).toEqual([]);
  });
});

describe('discovery conversation', () => {
  it('walks the questions and reaches review ready', async () => {
    const { repo } = setup((c) => (c.path === `/requests/${REQ_ID}` ? { status: 200, body: detailDto() } : err(404, 'NOT_FOUND')));
    const s = await repo.startConversation({ requestId: REQ_ID, mode: 'DISCOVERY' });
    expect(s.id).toBe(`http-${REQ_ID}`);
    expect(s.utterances[0]).toMatchObject({ speaker: 'DUTYGRAPH', text: 'What do you do first when a truck is late?' });
    expect(s.progress).toEqual({ current: 1, total: 2 });
    const t1 = await repo.sendTurn({ sessionId: s.id, utteranceId: 'u1', text: 'Call the carrier', source: 'TEXT' });
    expect(t1.reviewReady).toBe(false);
    expect(t1.session.utterances.at(-1)!.text).toBe('Who do you tell, and how?');
    expect(t1.session.progress).toEqual({ current: 2, total: 2 });
    // retry with the same utterance id changes nothing
    const again = await repo.sendTurn({ sessionId: s.id, utteranceId: 'u1', text: 'Call the carrier', source: 'TEXT' });
    expect(again.session.utterances).toHaveLength(3);
    const t2 = await repo.sendTurn({ sessionId: s.id, utteranceId: 'u2', text: 'Dock supervisor', source: 'TEXT' });
    expect(t2.reviewReady).toBe(true);
    expect(t2.session.state).toBe('REVIEW_READY');
  });

  it('resumes from secure storage after a restart', async () => {
    const h: Handler = (c) => (c.path === `/requests/${REQ_ID}` ? { status: 200, body: detailDto() } : err(404, 'NOT_FOUND'));
    const a = setup(h);
    const s = await a.repo.startConversation({ requestId: REQ_ID, mode: 'DISCOVERY' });
    await a.repo.sendTurn({ sessionId: s.id, utteranceId: 'u1', text: 'Call the carrier', source: 'TEXT' });
    const b = setup(h); // new repository instance = app restart
    const resumed = await b.repo.startConversation({ requestId: REQ_ID, mode: 'DISCOVERY' });
    expect(resumed.utterances.filter((u) => u.speaker === 'PARTICIPANT')).toHaveLength(1);
    expect(resumed.utterances.at(-1)!.text).toBe('Who do you tell, and how?');
  });

  it('uploads a clip as multipart with valid meta and an Idempotency-Key', async () => {
    const { repo, calls } = setup((c) => {
      if (c.path === `/requests/${REQ_ID}`) return { status: 200, body: detailDto() };
      if (c.path.endsWith('/transcriptions')) return { status: 200, body: { text: 'I call the carrier', reviewRequired: true, idempotentReplay: false, job: { jobId: JOB_ID, state: 'complete' } } };
      return err(404, 'NOT_FOUND');
    });
    const s = await repo.startConversation({ requestId: REQ_ID, mode: 'DISCOVERY' });
    const r = await repo.transcribeClip({ sessionId: s.id, uri: 'file:///tmp/a.m4a', mimeType: 'audio/m4a', durationMs: 4000 });
    expect(r.text).toBe('I call the carrier');
    const call = calls.find((c) => c.path.endsWith('/transcriptions'))!;
    expect(call.headers['Idempotency-Key']).toBe('gen-key-1');
    expect(call.headers['Content-Type']).toBeUndefined();
    const audio = call.form!.get('audio') as any;
    expect(audio).toBeTruthy();
    const meta = JSON.parse(call.form!.get('meta') as string);
    expect(() => mobileTranscriptionUploadMeta.parse(meta)).not.toThrow();
    expect(meta).toMatchObject({ expectedVersion: 3, contentHash: REQ_HASH, consent: true });
  });
});

describe('discovery review and submit', () => {
  const server = (understanding: () => any): Handler => (c) => {
    if (c.path === `/requests/${REQ_ID}`) return { status: 200, body: detailDto() };
    if (c.path.endsWith('/understanding')) return understanding();
    if (c.path.endsWith('/submit')) return { status: 201, body: { responseId: JOB_ID, requestId: REQ_ID, requestState: 'returned', version: 4, idempotentReplay: false, reconciliation: { state: 'queued' }, reviewState: c.json.understanding ? 'cards_proposed' : 'words_unreviewed' } };
    return err(404, 'NOT_FOUND');
  };

  it('maps proposed tasks to items and submits the reviewed wording with the input key', async () => {
    const { repo, calls } = setup(server(() => ({ status: 200, body: proposal() })));
    const t = await answerAll(repo);
    const review = await repo.getReview(t.session.id);
    const u = calls.find((c) => c.path.endsWith('/understanding'))!;
    expect(() => mobileUnderstandingBody.parse(u.json)).not.toThrow();
    expect(u.json.sourceText).toContain('I call the carrier.');
    expect(review.items).toHaveLength(1);
    expect(review.items[0]).toMatchObject({ label: 'Call the carrier', status: 'PENDING' });
    expect(review.items[0].proposedText).toContain('Not stated: handoff, software.');
    expect(review.canAddItems).toBe(false);

    const item = await repo.updateReviewItem(review.sessionId, { ...review.items[0], status: 'CHANGED', participantEditedText: 'I phone dispatch and note the new ETA.' });
    const done = await repo.submitReview({ sessionId: review.sessionId, idempotencyKey: 'submit-key-1', items: [item] });
    const sub = calls.find((c) => c.path.endsWith('/submit'))!;
    expect(sub.headers['Idempotency-Key']).toBe('submit-key-1');
    expect(() => mobileSubmitBody.parse(sub.json)).not.toThrow();
    expect(sub.json).toMatchObject({ participantConfirmed: true, expectedVersion: 3, contentHash: REQ_HASH, source: 'typed', text: u.json.sourceText });
    expect(sub.json.attestation).toEqual({ requestContentHash: REQ_HASH, understandingHash: UNDERSTANDING_HASH });
    expect(sub.json.understanding.contentHash).toBe(UNDERSTANDING_HASH);
    expect(sub.json.understanding.tasks).toHaveLength(1);
    expect(sub.json.understanding.tasks[0]).toMatchObject({ decision: 'correct', instructions: 'I phone dispatch and note the new ETA.', missingFields: ['handoff', 'software'] });
    expect(done).toMatchObject({ headline: 'Sent. Thank you.' });
    expect(done.body).not.toMatch(/unreviewed/);
  });

  it('excludes rejected items from the confirmed tasks', async () => {
    const two = proposal({ tasks: [proposal().tasks[0], { ...proposal().tasks[0], title: 'Second' }] });
    const { repo, calls } = setup(server(() => ({ status: 200, body: two })));
    const t = await answerAll(repo);
    const review = await repo.getReview(t.session.id);
    await repo.submitReview({
      sessionId: review.sessionId,
      idempotencyKey: 'k',
      items: [{ ...review.items[0], status: 'CONFIRMED' }, { ...review.items[1], status: 'REJECTED' }],
    });
    const sub = calls.find((c) => c.path.endsWith('/submit'))!;
    expect(sub.json.understanding.tasks.map((x: any) => x.title)).toEqual(['Call the carrier']);
    expect(() => mobileSubmitBody.parse(sub.json)).not.toThrow();
  });

  it.each<[string, () => any]>([
    ['503 not configured', () => err(503, 'UNDERSTANDING_NOT_CONFIGURED')],
    ['429 limit', () => err(429, 'DRAFT_LIMIT', true)],
    ['504 timeout', () => err(504, 'UNDERSTANDING_TIMEOUT', true)],
    ['no tasks', () => ({ status: 200, body: proposal({ tasks: [] }) })],
  ])('falls back to send-my-words on %s', async (_n: string, reply: () => any) => {
    const { repo, calls } = setup(server(reply as () => any));
    const t = await answerAll(repo);
    const review = await repo.getReview(t.session.id);
    expect(review.items).toHaveLength(1);
    expect(review.items[0]).toMatchObject({ label: 'Your words', allowedActions: ['CONFIRM', 'CHANGE'] });
    expect(review.items[0].proposedText).toContain('The dock supervisor, by radio.');
    expect(review.copy.subtitle).toBe("DutyGraph can't summarize this right now. Your own words will go to your advisor for review.");

    // must confirm before it can be sent
    await expect(repo.submitReview({ sessionId: review.sessionId, idempotencyKey: 'w', items: review.items })).rejects.toMatchObject({ code: 'NOT_CONFIRMED' });
    const done = await repo.submitReview({ sessionId: review.sessionId, idempotencyKey: 'w-key', items: [{ ...review.items[0], status: 'CONFIRMED' }] });
    const sub = calls.find((c) => c.path.endsWith('/submit'))!;
    expect(sub.headers['Idempotency-Key']).toBe('w-key');
    expect(sub.json).toMatchObject({ understanding: null, understandingUnavailable: true, participantConfirmed: true });
    expect(sub.json.attestation).toEqual({ requestContentHash: REQ_HASH });
    expect(() => mobileSubmitBody.parse(sub.json)).not.toThrow();
    expect(done.body).toBe('Your answer is saved. Your advisor will review it.');
  });

  it('does not swallow non-availability errors from understanding', async () => {
    const { repo } = setup(server(() => err(409, 'HASH_CONFLICT')));
    const t = await answerAll(repo);
    await expect(repo.getReview(t.session.id)).rejects.toMatchObject({ code: 'HASH_CONFLICT' });
  });

  it('records what was sent today so Today can show it as done', async () => {
    const summary = { requestId: REQ_ID, version: 1, contentHash: REQ_HASH, title: 'Freight', type: 'work', state: 'returned', dueDate: '2026-10-02', questionCount: 2, needsYou: false };
    const { repo } = setup((c, n) => (c.path === '/requests' ? { status: 200, body: { requests: [summary] } } : server(() => ({ status: 503, body: {} }))(c, n)));
    const t = await answerAll(repo);
    const review = await repo.getReview(t.session.id);
    await repo.submitReview({ sessionId: review.sessionId, idempotencyKey: 'k', items: [{ ...review.items[0], status: 'CONFIRMED' }] });
    const feed = await repo.getToday();
    expect(feed.doneToday.map((d) => d.id)).toEqual([REQ_ID]);
  });
});

describe('task checks (confirmation)', () => {
  const card = (id: string, n: number) => ({ id, title: `Card ${n}`, version: n, hash: hex(String(n)), state: 'active', needsAttestation: true, reviewed: false, data: { duty: 'Do the thing', output: 'A report', systems: ['SAP'] } });
  const handler = (returnedOn: string): Handler => (c) => {
    if (c.path === `/requests/${CONF_ID}`) return { status: 200, body: detailDto({ requestId: CONF_ID, type: 'confirmation', taskCardIds: [CARD_A, CARD_B], questions: [{ questionId: 'q', text: 'Check' }] }) };
    if (c.path === `/task-cards/${CARD_A}`) return { status: 200, body: card(CARD_A, 1) };
    if (c.path === `/task-cards/${CARD_B}`) return { status: 200, body: card(CARD_B, 2) };
    const m = /^\/task-cards\/(.+)\/attest$/.exec(c.path);
    if (m) return { status: 200, body: { ok: true, taskCardId: m[1], version: 1, hash: hex('1'), decision: 'correct', taskUnchanged: true, ...(m[1] === returnedOn ? { checkReturned: true } : {}) } };
    return err(404, 'NOT_FOUND');
  };

  it('attests each confirmed card with version, hash and derived keys', async () => {
    const { repo, calls } = setup(handler(CARD_B));
    const s = await repo.startConversation({ requestId: CONF_ID, mode: 'CONFIRMATION' });
    expect(s.state).toBe('REVIEW_READY');
    const review = await repo.getReview(s.id);
    expect(review.items).toHaveLength(2);
    expect(review.items[0]).toMatchObject({ label: 'Task', allowedActions: ['CONFIRM'] });
    expect(review.items[0].proposedText).toContain('Card 1');
    const done = await repo.submitReview({ sessionId: s.id, idempotencyKey: 'base', items: review.items.map((i) => ({ ...i, status: 'CONFIRMED' as const })) });
    const attests = calls.filter((c) => c.path.endsWith('/attest'));
    expect(attests.map((c) => c.path)).toEqual([`/task-cards/${CARD_A}/attest`, `/task-cards/${CARD_B}/attest`]);
    expect(attests[0].json).toEqual({ recordVersion: 1, contentHash: hex('1'), decision: 'correct', correction: null });
    expect(attests[1].json.recordVersion).toBe(2);
    expect(attests[0].headers['Idempotency-Key']).toBe(`base:${CARD_A}`);
    expect(attests[1].headers['Idempotency-Key']).toBe(`base:${CARD_B}`);
    attests.forEach((c) => expect(() => mobileAttestBody.parse(c.json)).not.toThrow());
    expect(done.body).toMatch(/gone back to your advisor/);
  });

  it('only attests confirmed cards', async () => {
    const { repo, calls } = setup(handler('none'));
    const s = await repo.startConversation({ requestId: CONF_ID, mode: 'CONFIRMATION' });
    const review = await repo.getReview(s.id);
    const done = await repo.submitReview({ sessionId: s.id, idempotencyKey: 'k', items: [{ ...review.items[0], status: 'CONFIRMED' }, review.items[1]] });
    expect(calls.filter((c) => c.path.endsWith('/attest'))).toHaveLength(1);
    expect(done.body).toBe('Your confirmations are recorded.');
  });
});

describe('not in the contract yet', () => {
  it('rejects with NOT_AVAILABLE and returns empty tab data', async () => {
    const { repo } = setup(() => err(404, 'NOT_FOUND'));
    await expect(repo.getPulse('x')).rejects.toMatchObject({ code: 'NOT_AVAILABLE', status: 501, retryable: false, message: "This isn't available on your account yet." });
    await expect(repo.getMeeting('x')).rejects.toMatchObject({ code: 'NOT_AVAILABLE' });
    await expect(repo.startConversation({ requestId: 'x', mode: 'PULSE' })).rejects.toMatchObject({ code: 'NOT_AVAILABLE' });
    expect(await repo.getMeetings()).toEqual([]);
    expect(await repo.getNotifications()).toEqual([]);
    expect(await repo.getWork()).toEqual({ today: [], thisWeek: [], later: [], waiting: [], done: [] });
    expect((await repo.getChangeKinds()).length).toBeGreaterThan(0);
  });
});
