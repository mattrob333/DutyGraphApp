import { describe, expect, it } from '@jest/globals';
import { canTypeInstead, initialViewState, transition, type ConversationEvent, type ConversationViewState } from '../machine';

const run = (s: ConversationViewState, ...events: ConversationEvent[]) => events.reduce(transition, s);
const voice = () => initialViewState('voice');
const text = () => initialViewState('text');
const answering = (s = voice()) => run(s, { type: 'AGENT_SHOWN' });
const sending = (s = answering()) => run(s, { type: 'SUBMIT_ANSWER', utteranceId: 'u1', text: 'Yes, it went out on Wednesday.' });

describe('conversation view-state machine', () => {
  it('starts prompting with nothing pending', () => {
    expect(voice()).toEqual({ phase: 'prompting', inputMode: 'voice', listeningSeconds: 0, switchedToText: false });
  });

  describe('AGENT_SHOWN', () => {
    it('opens the answer once the question is shown', () => {
      expect(answering().phase).toBe('answering');
    });
    it('is ignored outside prompting', () => {
      const s = sending();
      expect(transition(s, { type: 'AGENT_SHOWN' })).toBe(s);
    });
  });

  describe('TICK', () => {
    it('counts only while listening by voice', () => {
      expect(run(answering(), { type: 'TICK', seconds: 1 }, { type: 'TICK', seconds: 1 }).listeningSeconds).toBe(2);
    });
    it('does not count in text mode, when paused or when prompting', () => {
      expect(run(answering(text()), { type: 'TICK', seconds: 1 }).listeningSeconds).toBe(0);
      expect(run(answering(), { type: 'PAUSE' }, { type: 'TICK', seconds: 1 }).listeningSeconds).toBe(0);
      expect(run(voice(), { type: 'TICK', seconds: 1 }).listeningSeconds).toBe(0);
    });
  });

  describe('PAUSE / RESUME', () => {
    it('pauses and resumes voice listening, keeping the elapsed time', () => {
      const s = run(answering(), { type: 'TICK', seconds: 3 }, { type: 'PAUSE' });
      expect(s.phase).toBe('paused');
      const r = transition(s, { type: 'RESUME' });
      expect(r.phase).toBe('answering');
      expect(r.listeningSeconds).toBe(3);
    });
    it('cannot pause text mode or a non-answering phase', () => {
      expect(transition(answering(text()), { type: 'PAUSE' }).phase).toBe('answering');
      expect(transition(voice(), { type: 'PAUSE' }).phase).toBe('prompting');
    });
    it('RESUME only applies when paused', () => {
      const s = answering();
      expect(transition(s, { type: 'RESUME' })).toBe(s);
    });
  });

  describe('SWITCH_TO_TEXT', () => {
    it('switches from answering, paused and micError, and remembers it', () => {
      for (const s of [answering(), run(answering(), { type: 'PAUSE' }), run(answering(), { type: 'MIC_DENIED' })]) {
        const t = transition(s, { type: 'SWITCH_TO_TEXT' });
        expect(t.inputMode).toBe('text');
        expect(t.phase).toBe('answering');
        expect(t.switchedToText).toBe(true);
      }
    });
    it('keeps prompting while the question is still showing', () => {
      expect(transition(voice(), { type: 'SWITCH_TO_TEXT' }).phase).toBe('prompting');
    });
    it('keeps the offline draft state when switching after a failed send', () => {
      const s = run(sending(), { type: 'TURN_FAILED', reason: 'offline' });
      expect(transition(s, { type: 'SWITCH_TO_TEXT' }).phase).toBe('offlineDraft');
    });
    it('is refused while waiting on the server', () => {
      const s = sending();
      expect(transition(s, { type: 'SWITCH_TO_TEXT' })).toBe(s);
      const closing = run(s, { type: 'TURN_ACK', reviewReady: true });
      expect(transition(closing, { type: 'SWITCH_TO_TEXT' })).toBe(closing);
    });
  });

  describe('SWITCH_TO_VOICE', () => {
    it('returns to voice from text and resets the timer', () => {
      const s = run(answering(), { type: 'TICK', seconds: 4 }, { type: 'SWITCH_TO_TEXT' }, { type: 'SWITCH_TO_VOICE' });
      expect(s.inputMode).toBe('voice');
      expect(s.listeningSeconds).toBe(0);
    });
    it('is refused while sending or in an error phase', () => {
      const s = sending();
      expect(transition(s, { type: 'SWITCH_TO_VOICE' })).toBe(s);
      const e = run(answering(), { type: 'MIC_DENIED' });
      expect(transition(e, { type: 'SWITCH_TO_VOICE' })).toBe(e);
    });
  });

  describe('MIC_DENIED / RETRY from micError', () => {
    it('shows the blocked state, and Try again reopens the answer', () => {
      const s = run(answering(), { type: 'MIC_DENIED' });
      expect(s.phase).toBe('micError');
      expect(transition(s, { type: 'RETRY' }).phase).toBe('answering');
    });
  });

  describe('SUBMIT_ANSWER', () => {
    it('moves to sending and keeps the utterance id and text for retries', () => {
      const s = sending();
      expect(s.phase).toBe('sending');
      expect(s.pendingUtteranceId).toBe('u1');
      expect(s.pendingText).toBe('Yes, it went out on Wednesday.');
    });
    it('is allowed while paused', () => {
      expect(sending(run(answering(), { type: 'PAUSE' })).phase).toBe('sending');
    });
    it('ignores empty answers and answers outside answering/paused', () => {
      const a = answering();
      expect(transition(a, { type: 'SUBMIT_ANSWER', utteranceId: 'u', text: '   ' })).toBe(a);
      const p = voice();
      expect(transition(p, { type: 'SUBMIT_ANSWER', utteranceId: 'u', text: 'hi' })).toBe(p);
    });
  });

  describe('TURN_ACK', () => {
    it('returns to prompting for the next question and clears the pending answer', () => {
      const s = transition(sending(), { type: 'TURN_ACK', reviewReady: false });
      expect(s.phase).toBe('prompting');
      expect(s.pendingUtteranceId).toBeUndefined();
      expect(s.pendingText).toBeUndefined();
      expect(s.listeningSeconds).toBe(0);
    });
    it('goes to closing when the server says review is ready', () => {
      expect(transition(sending(), { type: 'TURN_ACK', reviewReady: true }).phase).toBe('closing');
    });
    it('is ignored unless a turn is in flight', () => {
      const s = answering();
      expect(transition(s, { type: 'TURN_ACK', reviewReady: true })).toBe(s);
    });
  });

  describe('TURN_FAILED / RETRY', () => {
    it('offline failure keeps the answer and the same utterance id for the retry', () => {
      const failed = transition(sending(), { type: 'TURN_FAILED', reason: 'offline' });
      expect(failed.phase).toBe('offlineDraft');
      const retried = transition(failed, { type: 'RETRY' });
      expect(retried.phase).toBe('sending');
      expect(retried.pendingUtteranceId).toBe('u1');
    });
    it('provider failure offers retry with the same id', () => {
      const failed = transition(sending(), { type: 'TURN_FAILED', reason: 'provider' });
      expect(failed.phase).toBe('providerError');
      expect(transition(failed, { type: 'RETRY' })).toMatchObject({ phase: 'sending', pendingUtteranceId: 'u1' });
    });
    it('TURN_FAILED is ignored unless sending; RETRY does nothing elsewhere', () => {
      const a = answering();
      expect(transition(a, { type: 'TURN_FAILED', reason: 'provider' })).toBe(a);
      expect(transition(a, { type: 'RETRY' })).toBe(a);
    });
    it('continuing by typing after a provider error keeps the pending answer to prefill', () => {
      const failed = transition(sending(), { type: 'TURN_FAILED', reason: 'provider' });
      const typed = transition(failed, { type: 'SWITCH_TO_TEXT' });
      expect(typed).toMatchObject({ phase: 'answering', inputMode: 'text', pendingText: 'Yes, it went out on Wednesday.' });
    });
  });

  describe('full happy path', () => {
    it('prompting → answering → sending → prompting → … → closing', () => {
      let s = voice();
      s = run(s, { type: 'AGENT_SHOWN' }, { type: 'TICK', seconds: 2 });
      s = run(s, { type: 'SUBMIT_ANSWER', utteranceId: 'a', text: 'one' }, { type: 'TURN_ACK', reviewReady: false });
      expect(s.phase).toBe('prompting');
      s = run(s, { type: 'AGENT_SHOWN' }, { type: 'SUBMIT_ANSWER', utteranceId: 'b', text: 'two' }, { type: 'TURN_ACK', reviewReady: true });
      expect(s.phase).toBe('closing');
    });
  });

  describe('canTypeInstead', () => {
    it('is offered in voice mode except while waiting on the server', () => {
      expect(canTypeInstead(answering())).toBe(true);
      expect(canTypeInstead(sending())).toBe(false);
      expect(canTypeInstead(answering(text()))).toBe(false);
    });
  });
});
