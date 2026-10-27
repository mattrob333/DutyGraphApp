import { describe, expect, it } from '@jest/globals';
import { advisorFirst, advisorName, captionTail, dueShort, introEyebrow, introTitle, minutesLabel, sendLabel, tookLabel, youSaid } from '../format';

const NOW = new Date(2026, 9, 7, 9, 41); // Wednesday 7 October 2026

describe('hands-free copy', () => {
  it('names the advisor, or says "your advisor"', () => {
    expect(advisorName({ advisorName: 'Alex Rivera' })).toBe('Alex Rivera');
    expect(advisorFirst({ advisorName: 'Alex Rivera' })).toBe('Alex');
    expect(advisorName({ advisorName: ' ' })).toBe('your advisor');
    expect(sendLabel({ advisorName: 'Alex Rivera' })).toBe('Send to Alex');
    expect(sendLabel({ advisorName: '' })).toBe('Send');
  });

  it('counts questions and minutes in plain words', () => {
    expect(introTitle(6)).toBe('6 quick questions about your work');
    expect(introTitle(1)).toBe('1 quick question about your work');
    expect(minutesLabel(14)).toBe('About 14 minutes');
    expect(minutesLabel(1)).toBe('About 1 minute');
    expect(tookLabel(2 * 60_000 + 10_000)).toBe('That took about 2 minutes.');
    expect(tookLabel(5_000)).toBe('That took about 1 minute.');
  });

  it('shows the due day like the design', () => {
    expect(dueShort('2026-10-09', NOW)).toBe('Due Fri');
    expect(dueShort('2026-10-07', NOW)).toBe('Due today');
    expect(dueShort('2026-10-08', NOW)).toBe('Due tomorrow');
    expect(dueShort('2026-10-20', NOW)).toBe('Due 20 Oct');
    expect(dueShort('nope', NOW)).toBe('');
    expect(introEyebrow({ advisorName: 'Alex Rivera', dueDate: '2026-10-09' }, NOW)).toBe('Questions from Alex Rivera · Due Fri');
  });

  it('keeps the caption to the last 16 words and clips "You said"', () => {
    const long = Array.from({ length: 20 }, (_, i) => `w${i}`).join(' ');
    expect(captionTail(long)).toBe(`…${Array.from({ length: 16 }, (_, i) => `w${i + 4}`).join(' ')}`);
    expect(captionTail('Mostly the')).toBe('Mostly the');
    expect(youSaid('')).toBe('Nothing yet.');
    expect(youSaid('x'.repeat(200))).toHaveLength(169);
  });
});
