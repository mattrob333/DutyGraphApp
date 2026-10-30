import { describe, it, expect } from "@jest/globals";
import type { Claim } from '@/api/earn/types';
import { claimReason } from '../logic';
const claim = (reason: Claim['reason'], reasonText?: string): Claim => ({ id: 'claim', draftId: 'draft', taskRecordId: 'task', title: 'Count returned parts', state: 'not_paid', amountCents: 10000, createdAt: '2026-10-29T00:00:00Z', reason, reasonText });
describe('unpaid claim explanations', () => {
  it('preserves supplied complete product text', () => {
    expect(claimReason(claim('not_ready', 'Not ready: 3 slots are empty. Fill them and send it again.'))).toBe('Not ready: 3 slots are empty. Fill them and send it again.');
  });
  it('uses the exact cap message only when a configured cap is known', () => {
    expect(claimReason(claim('cap_reached'), 5)).toBe('You have 5 paid cards, the most for one person. This card is still saved to your map.');
    expect(claimReason(claim('cap_reached'), null)).toContain('Your company set a paid-card limit.');
  });
  it.each([
    ['not_ready', 'Not ready: some required details are missing. Fill them and send it again.'],
    ['too_small', 'Too small to earn: this task does not show an effect on what the team is measured on. It is still saved to your map.'],
    ['already_mapped', 'Already mapped: another card covers this work. Ask your manager which card and whether your extra steps were added.'],
    ['manager_declined', 'Your manager did not approve this card. Ask your manager for the reason.'],
  ] as [NonNullable<Claim["reason"]>, string][])('explains %s without inventing missing details', (reason, expected) => {
    expect(claimReason(claim(reason))).toBe(expected);
    expect(claimReason(claim(reason, '   '))).toBe(expected);
  });
});
