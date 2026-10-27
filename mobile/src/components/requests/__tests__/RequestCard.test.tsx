import React from 'react';
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { RequestCard } from '../RequestCard';
import { ThemeProvider } from '@/theme';
import type { ParticipationRequest } from '@/types/domain';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

jest.mock('expo-haptics', () => ({ impactAsync: async () => {}, ImpactFeedbackStyle: { Light: 'light' } }));

const NOW = new Date(2026, 8, 28, 9, 0);
const base: ParticipationRequest = {
  id: 'r1',
  type: 'PULSE',
  title: 'Monday Operations Pulse',
  summary: '4 questions · about 4 min',
  reason: 'Replaces the meeting.',
  status: 'NOT_STARTED',
  cta: 'Start Pulse',
  route: '/pulse/p1',
  dueAt: new Date(2026, 8, 28, 10, 30).toISOString(),
  createdAt: NOW.toISOString(),
};

const wrap = async (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

describe('RequestCard', () => {
  it('shows type, due chip, title, summary and calls onOpen', async () => {
    const onOpen = jest.fn();
    await wrap(<RequestCard request={base} now={NOW} variant="dueNow" primary onOpen={onOpen} />);
    expect(screen.getByText('Pulse')).toBeTruthy();
    expect(screen.getByText('Due 10:30 AM')).toBeTruthy();
    expect(screen.getByText('Monday Operations Pulse')).toBeTruthy();
    expect(screen.getByText('4 questions · about 4 min')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Start Pulse' }));
    expect(onOpen).toHaveBeenCalledWith(base);
  });
  it('shows Overdue when past due', async () => {
    await wrap(<RequestCard request={{ ...base, dueAt: new Date(2026, 8, 28, 8, 0).toISOString() }} now={NOW} variant="dueNow" onOpen={() => {}} />);
    expect(screen.getByText('Overdue')).toBeTruthy();
  });
  it('omits the due chip on later cards', async () => {
    await wrap(<RequestCard request={{ ...base, type: 'DISCOVERY', cta: 'Start' }} now={NOW} variant="later" onOpen={() => {}} />);
    expect(screen.queryByText('Due 10:30 AM')).toBeNull();
    expect(screen.getByText('Discovery')).toBeTruthy();
  });
});
