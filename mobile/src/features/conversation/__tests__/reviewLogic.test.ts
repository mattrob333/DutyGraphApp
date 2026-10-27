import { describe, expect, it } from '@jest/globals';
import type { InterpretationItem } from '@/types/domain';
import {
  buildSubmitInput,
  changeItemWording,
  checkedCount,
  confirmItem,
  effectiveText,
  newParticipantItem,
  reviewSummary,
} from '../reviewLogic';

const item = (id: string, over: Partial<InterpretationItem> = {}): InterpretationItem => ({
  id,
  sessionId: 's1',
  category: 'STATUS',
  label: 'Project status',
  proposedText: `Proposed ${id}`,
  status: 'PENDING',
  sourceUtteranceIds: ['u1'],
  allowedActions: ['CONFIRM', 'CHANGE'],
  ...over,
});

describe('review logic', () => {
  it('counts items the participant has acted on; unchecked do not count', () => {
    const items = [item('a'), item('b'), item('c')];
    expect(checkedCount(items)).toBe(0);
    const after = changeItemWording(confirmItem(items, 'a'), 'b', 'My own words');
    expect(checkedCount(after)).toBe(2);
    expect(reviewSummary(after)).toEqual({ total: 3, confirmed: 1, changed: 1, unchecked: 1 });
  });

  it('confirm sets CONFIRMED only where the server allows it', () => {
    const items = [item('a'), item('b', { allowedActions: ['CHANGE'] })];
    const out = confirmItem(confirmItem(items, 'a'), 'b');
    expect(out.map((i) => i.status)).toEqual(['CONFIRMED', 'PENDING']);
  });

  it('change wording stores the participant text, keeps the original, and trims', () => {
    const out = changeItemWording([item('a')], 'a', '  Sent Thursday, not Wednesday.  ');
    expect(out[0]).toMatchObject({ status: 'CHANGED', participantEditedText: 'Sent Thursday, not Wednesday.', proposedText: 'Proposed a' });
    expect(effectiveText(out[0])).toBe('Sent Thursday, not Wednesday.');
  });

  it('refuses a wording change the server does not allow, and empty wording', () => {
    const locked = [item('a', { allowedActions: ['CONFIRM'] })];
    expect(changeItemWording(locked, 'a', 'x')).toEqual(locked);
    const items = [item('b')];
    expect(changeItemWording(items, 'b', '   ')).toBe(items);
  });

  it('effectiveText falls back to the proposal when not changed', () => {
    expect(effectiveText(item('a'))).toBe('Proposed a');
    expect(effectiveText(item('a', { status: 'CONFIRMED' }))).toBe('Proposed a');
  });

  it('a participant-added item carries their words and is marked as theirs', () => {
    const added = newParticipantItem('s1', 'item-x', '  Carrier B also missed Tuesday.  ');
    expect(added).toMatchObject({ addedByParticipant: true, status: 'CHANGED', label: 'Added by you', participantEditedText: 'Carrier B also missed Tuesday.' });
    expect(effectiveText(added)).toBe('Carrier B also missed Tuesday.');
  });

  describe('submit input', () => {
    it('sends the reviewed wording and statuses, not the original interpretation', () => {
      const original = [item('a'), item('b'), item('c')];
      const reviewed = changeItemWording(confirmItem(original, 'a'), 'b', 'Our own version.');
      const input = buildSubmitInput('s1', 'key-1', reviewed);
      expect(input.sessionId).toBe('s1');
      expect(input.idempotencyKey).toBe('key-1');
      expect(input.items.map((i) => i.status)).toEqual(['CONFIRMED', 'CHANGED', 'PENDING']);
      expect(input.items[1].participantEditedText).toBe('Our own version.');
      expect(input.items.map(effectiveText)).toEqual(['Proposed a', 'Our own version.', 'Proposed c']);
      // The original array is untouched.
      expect(original.every((i) => i.status === 'PENDING')).toBe(true);
    });

    it('does not block on unchecked items: they go as PENDING for the server to decide', () => {
      const input = buildSubmitInput('s1', 'k', [item('a'), item('b')]);
      expect(input.items.map((i) => i.status)).toEqual(['PENDING', 'PENDING']);
    });

    it('copies items so later local edits cannot change what was saved', () => {
      const items = [item('a')];
      const input = buildSubmitInput('s1', 'k', items);
      items[0].status = 'CONFIRMED';
      expect(input.items[0].status).toBe('PENDING');
    });
  });
});
