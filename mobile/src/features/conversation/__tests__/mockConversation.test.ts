import { beforeEach, describe, expect, it } from '@jest/globals';
import type { CompanionRepository } from '@/api/repository';
import { MOCK_IDS, MockCompanionRepository } from '@/api/mock/MockCompanionRepository';
import { VAGUE_FOLLOW_UP } from '@/api/mock/scripts';
import { CompanionApiError, type ConversationSession, type InterpretationItem } from '@/types/domain';
import { useSimulationStore } from '@/state/simulation';
import { buildSubmitInput, changeItemWording, confirmItem } from '../reviewLogic';

let repo: MockCompanionRepository;
beforeEach(() => {
  useSimulationStore.getState().reset();
  repo = new MockCompanionRepository();
  repo.latency = 0;
});

const start = () => repo.startConversation({ requestId: MOCK_IDS.pulseRequest, mode: 'PULSE' });
let n = 0;
const answer = (s: ConversationSession, text = 'A thorough answer with plenty of detail about the work.') =>
  repo.sendTurn({ sessionId: s.id, utteranceId: `utt_${++n}`, text, source: 'TEXT' });

/** Answers every question until the server says review is ready. */
async function finish(s: ConversationSession) {
  let last = await answer(s);
  for (let i = 0; i < 10 && !last.reviewReady; i++) last = await answer(s);
  return last;
}

describe('MockCompanionRepository conversation', () => {
  it('starts a PULSE session with DutyGraph asking the first question', async () => {
    const s = await start();
    expect(s.mode).toBe('PULSE');
    expect(s.state).toBe('ACTIVE');
    expect(s.progress).toEqual({ current: 1, total: 4 });
    expect(s.utterances).toHaveLength(1);
    expect(s.utterances[0]).toMatchObject({ speaker: 'DUTYGRAPH', kind: 'QUESTION' });
  });

  it('resumes the same unsubmitted session for the same request', async () => {
    const a = await start();
    const b = await start();
    expect(b.id).toBe(a.id);
  });

  it('answers each turn until the server declares review ready', async () => {
    const s = await start();
    let asked = 0;
    let res = await answer(s);
    while (!res.reviewReady && asked < 10) {
      asked++;
      expect(res.session.utterances[res.session.utterances.length - 1].speaker).toBe('DUTYGRAPH');
      res = await answer(s);
    }
    expect(res.reviewReady).toBe(true);
    expect(res.session.state).toBe('REVIEW_READY');
    expect(res.session.progress.current).toBe(res.session.progress.total);
    const review = await repo.getReview(s.id);
    expect(review.items.length).toBeGreaterThan(0);
    expect(review.items.every((i) => i.status === 'PENDING')).toBe(true);
    expect(review.copy.chip).toContain('not submitted');
    expect(review.canAddItems).toBe(true);
  });

  it('is idempotent on a duplicate utterance id', async () => {
    const s = await start();
    const first = await repo.sendTurn({ sessionId: s.id, utteranceId: 'utt-dup', text: 'A thorough answer with plenty of detail here.', source: 'TEXT' });
    const again = await repo.sendTurn({ sessionId: s.id, utteranceId: 'utt-dup', text: 'A thorough answer with plenty of detail here.', source: 'TEXT' });
    expect(again.session.utterances).toHaveLength(first.session.utterances.length);
    expect(again.session.utterances.filter((u) => u.id === 'utt-dup')).toHaveLength(1);
    expect(again.session.progress).toEqual(first.session.progress);
  });

  it('asks the dynamic follow-up for a one or two word answer, once per topic', async () => {
    const s = await start();
    const res = await answer(s, 'Yes');
    const last = res.session.utterances[res.session.utterances.length - 1];
    expect(last).toMatchObject({ speaker: 'DUTYGRAPH', kind: 'FOLLOW_UP', text: VAGUE_FOLLOW_UP });
    expect(VAGUE_FOLLOW_UP).toBe('Could you say a little more about that?');
    expect(res.session.state).toBe('FOLLOW_UP');
    expect(res.session.progress.current).toBe(1);
    // A second short answer to the same topic moves on rather than nagging.
    const next = await answer(s, 'Yes');
    expect(next.session.progress.current).toBe(2);
  });

  it('fails a turn as offline when the simulation says so, and a retry with the same id works', async () => {
    const s = await start();
    useSimulationStore.getState().set({ offline: true });
    await expect(answer(s)).rejects.toMatchObject({ status: 0 });
    useSimulationStore.getState().set({ offline: false });
    const ok = await repo.sendTurn({ sessionId: s.id, utteranceId: 'utt-retry', text: 'A thorough answer with plenty of detail here.', source: 'TEXT' });
    expect(ok.session.utterances.some((u) => u.id === 'utt-retry')).toBe(true);
  });

  it('transcribes a clip to the scripted sample answer', async () => {
    const s = await start();
    const { text } = await (repo as CompanionRepository).transcribeClip({ sessionId: s.id, uri: 'file:///x.m4a', mimeType: 'audio/m4a', durationMs: 4000 });
    expect(text).toBe(repo.sampleAnswerFor(s.id));
    expect(text.length).toBeGreaterThan(10);
  });

  describe('submit', () => {
    async function reviewed() {
      const s = await start();
      await finish(s);
      const review = await repo.getReview(s.id);
      return { s, review };
    }

    it('is idempotent with the same key and conflicts with a different key', async () => {
      const { s, review } = await reviewed();
      const items = confirmItem(review.items, review.items[0].id);
      const first = await repo.submitReview(buildSubmitInput(s.id, 'key-A', items));
      const again = await repo.submitReview(buildSubmitInput(s.id, 'key-A', items));
      expect(again).toEqual(first);
      await expect(repo.submitReview(buildSubmitInput(s.id, 'key-B', items))).rejects.toMatchObject({
        code: 'IDEMPOTENCY_CONFLICT',
        status: 409,
      });
    });

    it('records the reviewed wording, not the original', async () => {
      const { s, review } = await reviewed();
      const reviewedItems: InterpretationItem[] = changeItemWording(review.items, review.items[0].id, 'In my own words.');
      const spy: InterpretationItem[][] = [];
      const original = repo.submitReview.bind(repo);
      repo.submitReview = async (input) => {
        spy.push(input.items);
        return original(input);
      };
      await repo.submitReview(buildSubmitInput(s.id, 'key-1', reviewedItems));
      expect(spy[0][0]).toMatchObject({ status: 'CHANGED', participantEditedText: 'In my own words.' });
    });

    it('does not complete when the send fails, so the client must not show done', async () => {
      const { s, review } = await reviewed();
      useSimulationStore.getState().set({ failSend: true });
      await expect(repo.submitReview(buildSubmitInput(s.id, 'key-1', review.items))).rejects.toBeInstanceOf(CompanionApiError);
      useSimulationStore.getState().set({ failSend: false });
      const ok = await repo.submitReview(buildSubmitInput(s.id, 'key-1', review.items));
      expect(ok.headline).toBe('Pulse submitted');
      expect(ok.nextRoute).toContain('/team-status');
    });

    it('rejects a wording change the server does not allow (403 FORBIDDEN_FIELD)', async () => {
      const w = await repo.startConversation({ requestId: 'req-wrapup-x', mode: 'MEETING_WRAP_UP' });
      const review = await repo.getReview(w.id);
      const decision = review.items.find((i) => !i.allowedActions.includes('CHANGE'))!;
      await expect(repo.updateReviewItem(w.id, { ...decision, status: 'CHANGED', participantEditedText: 'nope' })).rejects.toMatchObject({
        code: 'FORBIDDEN_FIELD',
        status: 403,
      });
    });

    it('a wrap-up submit routes to the created commitment', async () => {
      const w = await repo.startConversation({ requestId: 'req-wrapup-x', mode: 'MEETING_WRAP_UP' });
      const review = await repo.getReview(w.id);
      const res = await repo.submitReview(buildSubmitInput(w.id, 'k', review.items));
      expect(res.nextRoute).toBe('/work/commitments/c-fallback');
    });
  });

  describe('team status', () => {
    it('never contains answer text', async () => {
      const s = await start();
      const secret = 'Zebra-crossing-canary the carrier lied about the delivery window on Tuesday.';
      await answer(s, secret);
      await finish(s);
      const review = await repo.getReview(s.id);
      await repo.submitReview(buildSubmitInput(s.id, 'k', changeItemWording(review.items, review.items[0].id, 'Canary wording from the participant.')));
      const status = await repo.getTeamStatus(MOCK_IDS.pulse);
      const json = JSON.stringify(status);
      expect(json).not.toContain('Zebra');
      expect(json).not.toContain('Canary');
      expect(json).not.toContain(review.items[0].proposedText);
      // Completion metadata only.
      for (const row of status.rows) expect(Object.keys(row).sort()).toEqual(['displayName', 'isYou', 'participantId', 'status']);
    });
  });
});
