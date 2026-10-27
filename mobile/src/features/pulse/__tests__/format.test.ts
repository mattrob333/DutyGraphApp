import { describe, expect, it } from '@jest/globals';
import { coverageRows, participantStatusLabel, progressFraction, pulseKicker, replacesMeetingLine } from '../format';

describe('participantStatusLabel', () => {
  it('maps every status to factual copy and tone', () => {
    const due = new Date(2026, 8, 28, 10, 30).toISOString();
    expect(participantStatusLabel('COMPLETE')).toEqual({ label: 'Complete', color: 'sage' });
    expect(participantStatusLabel('IN_PROGRESS')).toEqual({ label: 'In progress', color: 'muted' });
    expect(participantStatusLabel('DUE_SOON', due)).toEqual({ label: 'Due 10:30 AM', color: 'amber' });
    expect(participantStatusLabel('DUE_SOON')).toEqual({ label: 'Due', color: 'amber' });
    expect(participantStatusLabel('OVERDUE')).toEqual({ label: 'Overdue', color: 'red' });
    expect(participantStatusLabel('NOT_STARTED')).toEqual({ label: 'Not started', color: 'muted' });
  });
});

describe('pulse intro copy', () => {
  it('builds the kicker and meeting line', () => {
    expect(pulseKicker({ dueAt: new Date(2026, 8, 28, 10, 30).toISOString() })).toBe('Pulse · due 10:30 AM');
    expect(replacesMeetingLine({ replacesMeeting: { meetingId: 'm', title: 'status meeting', startsAt: '', durationMinutes: 60 } })).toBe(
      "Instead of the 60-minute status meeting, DutyGraph is collecting everyone's update individually.",
    );
    expect(replacesMeetingLine({})).toBeUndefined();
  });
  it('uses topics when supplied, otherwise a question count', () => {
    expect(coverageRows({ questionCount: 2 }, ['A', 'B'])).toEqual({ numbered: true, rows: ['A', 'B'] });
    expect(coverageRows({ questionCount: 4 })).toEqual({ numbered: false, rows: ['4 questions'] });
    expect(coverageRows({ questionCount: 1 }, []).rows).toEqual(['1 question']);
  });
});

describe('progressFraction', () => {
  it('clamps and handles zero totals', () => {
    expect(progressFraction(3, 11)).toBeCloseTo(0.2727, 3);
    expect(progressFraction(0, 0)).toBe(0);
    expect(progressFraction(12, 11)).toBe(1);
    expect(progressFraction(-1, 11)).toBe(0);
  });
});
