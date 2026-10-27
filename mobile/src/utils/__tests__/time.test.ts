import { describe, expect, it } from '@jest/globals';
import { atLocal, dueChipLabel, formatClock, formatElapsed, formatLongDate, formatShortClock, greeting, isSameDay, urgencyFor } from '../time';

// Local-time constructors keep these tests independent of the machine time zone.
// Monday 28 September 2026.
const at = (h: number, m = 0, day = 28, month = 8) => new Date(2026, month, day, h, m, 0, 0);
const iso = (d: Date) => d.toISOString();
const NOW = at(9, 0);

describe('urgencyFor', () => {
  it('is NONE without a due time', () => {
    expect(urgencyFor(undefined, NOW)).toBe('NONE');
  });
  it('is NONE once complete, even if past due', () => {
    expect(urgencyFor(iso(at(8, 0)), NOW, true)).toBe('NONE');
  });
  it('is NONE for an unparseable date', () => {
    expect(urgencyFor('not a date', NOW)).toBe('NONE');
  });
  it('is OVERDUE when the due time has passed', () => {
    expect(urgencyFor(iso(at(8, 59)), NOW)).toBe('OVERDUE');
    expect(urgencyFor(iso(at(9, 0, 27)), NOW)).toBe('OVERDUE');
  });
  it('is DUE_SOON within two hours the same day (inclusive of the boundary and of now)', () => {
    expect(urgencyFor(iso(at(9, 0)), NOW)).toBe('DUE_SOON');
    expect(urgencyFor(iso(at(10, 30)), NOW)).toBe('DUE_SOON');
    expect(urgencyFor(iso(at(11, 0)), NOW)).toBe('DUE_SOON');
  });
  it('is DUE later the same day beyond two hours', () => {
    expect(urgencyFor(iso(at(11, 1)), NOW)).toBe('DUE');
    expect(urgencyFor(iso(at(17, 0)), NOW)).toBe('DUE');
  });
  it('is NONE on a later day', () => {
    expect(urgencyFor(iso(at(9, 0, 29)), NOW)).toBe('NONE');
    expect(urgencyFor(iso(at(0, 5, 29)), at(23, 50))).toBe('NONE');
  });
});

describe('dueChipLabel', () => {
  it('returns undefined without a due time or with an invalid one', () => {
    expect(dueChipLabel(undefined, NOW)).toBeUndefined();
    expect(dueChipLabel('nope', NOW)).toBeUndefined();
  });
  it('says Overdue for a past due time', () => {
    expect(dueChipLabel(iso(at(8, 30)), NOW)).toBe('Overdue');
    expect(dueChipLabel(iso(at(8, 30, 25)), NOW)).toBe('Overdue');
  });
  it('shows the clock for a same-day due time', () => {
    expect(dueChipLabel(iso(at(10, 30)), NOW)).toBe('Due 10:30 AM');
    expect(dueChipLabel(iso(at(16, 0)), NOW)).toBe('Due 4:00 PM');
  });
  it('says tomorrow, weekday, or date depending on distance', () => {
    expect(dueChipLabel(iso(at(17, 0, 29)), NOW)).toBe('Due tomorrow');
    expect(dueChipLabel(iso(at(17, 0, 30)), NOW)).toBe('Due Wednesday');
    expect(dueChipLabel(iso(at(17, 0, 4, 9)), NOW)).toBe('Due Sunday');
    expect(dueChipLabel(iso(at(17, 0, 5, 9)), NOW)).toBe('Due 5 October');
    expect(dueChipLabel(iso(at(17, 0, 2, 10)), NOW)).toBe('Due 2 November');
  });
  it('does not treat late-night as the next day', () => {
    expect(dueChipLabel(iso(at(23, 59)), at(0, 1))).toBe('Due 11:59 PM');
  });
});

describe('greeting', () => {
  it.each([
    [0, 'Good morning'],
    [5, 'Good morning'],
    [11, 'Good morning'],
    [12, 'Good afternoon'],
    [17, 'Good afternoon'],
    [18, 'Good evening'],
    [23, 'Good evening'],
  ])('at hour %i says %s', (h, expected) => {
    expect(greeting(at(h, 30))).toBe(expected);
  });
});

describe('formatLongDate', () => {
  it('uses the prototype format', () => {
    expect(formatLongDate(at(9))).toBe('Monday, 28 September');
    expect(formatLongDate(new Date(2026, 0, 1))).toBe('Thursday, 1 January');
    expect(formatLongDate(new Date(2026, 11, 31, 23, 59))).toBe('Thursday, 31 December');
  });
});

describe('formatElapsed', () => {
  it('formats mm:ss', () => {
    expect(formatElapsed(0)).toBe('00:00');
    expect(formatElapsed(5)).toBe('00:05');
    expect(formatElapsed(65)).toBe('01:05');
    expect(formatElapsed(600)).toBe('10:00');
  });
  it('floors fractions and clamps negatives', () => {
    expect(formatElapsed(59.9)).toBe('00:59');
    expect(formatElapsed(-4)).toBe('00:00');
  });
  it('keeps counting minutes past an hour', () => {
    expect(formatElapsed(3725)).toBe('62:05');
  });
});

describe('clock helpers', () => {
  it('formatClock handles midnight and noon', () => {
    expect(formatClock(at(0, 5))).toBe('12:05 AM');
    expect(formatClock(at(12, 0))).toBe('12:00 PM');
    expect(formatClock(at(13, 7))).toBe('1:07 PM');
  });
  it('formatShortClock drops the meridiem', () => {
    expect(formatShortClock(at(11, 0))).toBe('11:00');
    expect(formatShortClock(at(14, 0))).toBe('2:00');
    expect(formatShortClock(at(0, 9))).toBe('12:09');
  });
  it('isSameDay compares calendar dates', () => {
    expect(isSameDay(at(0, 1), at(23, 59))).toBe(true);
    expect(isSameDay(at(23, 59), at(0, 1, 29))).toBe(false);
  });
  it('atLocal offsets days from the base without mutating it', () => {
    const base = at(15, 45);
    const d = atLocal(8, 30, 2, base);
    expect(d.getDate()).toBe(30);
    expect(d.getHours()).toBe(8);
    expect(d.getMinutes()).toBe(30);
    expect(base.getDate()).toBe(28);
    expect(base.getHours()).toBe(15);
  });
});
