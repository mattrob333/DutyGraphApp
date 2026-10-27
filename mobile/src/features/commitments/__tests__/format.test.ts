import { describe, expect, it } from '@jest/globals';
import { commitmentRows, detailDue, waitingRows } from '../format';
import type { Commitment } from '@/types/domain';

const base: Commitment = {
  id: 'c1', kind: 'COMMITMENT', title: 'T', outcome: 'Out', dueLabel: 'Due today · 4:00 PM', status: 'OPEN',
  sourceType: 'MEETING', sourceLabel: 'Src', canComplete: true,
};

describe('commitment formatting', () => {
  it('turns a due line into a detail value', () => {
    expect(detailDue('Due today · 4:00 PM')).toBe('Today · 4:00 PM');
    expect(detailDue('Thursday')).toBe('Thursday');
  });
  it('shows only fields that are present', () => {
    const rows = commitmentRows({ ...base, why: 'Because' });
    expect(rows.map((r) => r.label)).toEqual(['Outcome', 'Due', 'Why', 'Source']);
  });
  it('builds waiting rows without inventing an owner', () => {
    expect(waitingRows({ ...base, kind: 'WAITING_ON', latest: 'L' }).map((r) => r.label)).toEqual(['Needed for', 'Latest']);
    expect(waitingRows({ ...base, waitingOn: { displayName: 'Samir', team: 'IT' } })[0].value).toBe('Samir, IT');
  });
});
