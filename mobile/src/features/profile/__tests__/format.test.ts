import { describe, expect, it } from '@jest/globals';
import { formatDuration, initials } from '../format';

describe('profile format', () => {
  it('formats durations', () => {
    expect(formatDuration(225)).toBe('3h 45m');
    expect(formatDuration(45)).toBe('45m');
    expect(formatDuration(120)).toBe('2h');
    expect(formatDuration(-3)).toBe('0m');
  });
  it('builds initials', () => {
    expect(initials('Dana Okafor')).toBe('DO');
    expect(initials('  cher ')).toBe('C');
    expect(initials('Mary Jane Watson')).toBe('MW');
    expect(initials('')).toBe('?');
  });
});
