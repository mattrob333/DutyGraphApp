import React from 'react';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-haptics', () => ({ impactAsync: async () => {}, ImpactFeedbackStyle: { Light: 'light' } }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
const mockReplace = jest.fn();
const mockDismissTo = jest.fn();
jest.mock('expo-router', () => ({
  router: { replace: (...a: unknown[]) => mockReplace(...a), dismissTo: (...a: unknown[]) => mockDismissTo(...a) },
  useFocusEffect: () => {},
}));

import { RepositoryProvider } from '@/api';
import { MOCK_IDS, MockCompanionRepository } from '@/api/mock/MockCompanionRepository';
import { ThemeProvider } from '@/theme';
import { DoneScreen } from '../DoneScreen';
import { useResultStore } from '../resultStore';

let repo: MockCompanionRepository;
function renderDone(sessionId: string, pulseId?: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  return render(
    <QueryClientProvider client={qc}>
      <RepositoryProvider repository={repo}>
        <ThemeProvider>
          <DoneScreen sessionId={sessionId} pulseId={pulseId} />
        </ThemeProvider>
      </RepositoryProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockReplace.mockClear();
  mockDismissTo.mockClear();
  useResultStore.setState({ results: {} });
  repo = new MockCompanionRepository();
  repo.latency = 0;
});

describe('DoneScreen', () => {
  it('pulse: headline and body from the acknowledged result, what was sent, See team status and Back to Today', async () => {
    const s = await repo.startConversation({ requestId: MOCK_IDS.pulseRequest, mode: 'PULSE' });
    useResultStore.getState().put(s.id, {
      result: { sessionId: s.id, acknowledgedAt: '2026-09-29T10:00:00Z', headline: 'Pulse submitted', body: "Thanks, Dana. We'll let you know if the 11:00 meeting still needs you." },
      summary: { total: 6, confirmed: 3, changed: 1, unchecked: 2 },
      elapsedMs: 222_000,
    });
    await renderDone(s.id, MOCK_IDS.pulse);
    expect(screen.getByText('Pulse submitted')).toBeTruthy();
    expect(screen.getByText(/Thanks, Dana/)).toBeTruthy();
    expect(screen.getByText('3m 42s')).toBeTruthy();
    expect(screen.getByText('3 points confirmed as written')).toBeTruthy();
    expect(screen.getByText('1 point in your own words')).toBeTruthy();
    expect(screen.getByText("2 points you didn't check")).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'See team status' }));
    expect(mockReplace).toHaveBeenCalledWith(`/pulse/${MOCK_IDS.pulse}/team-status`);
    await fireEvent.press(screen.getByRole('button', { name: 'Back to Today' }));
    expect(mockDismissTo).toHaveBeenCalledWith('/today');
  });

  it('generic: "Sent. Thank you." with the server body and Back to Today', async () => {
    const s = await repo.startConversation({ requestId: MOCK_IDS.confirmRequest, mode: 'CONFIRMATION' });
    useResultStore.getState().put(s.id, { result: { sessionId: s.id, acknowledgedAt: '2026-09-29T10:00:00Z', headline: 'Sent. Thank you.', body: "Friday's review is confirmed." } });
    await renderDone(s.id);
    expect(screen.getByText('Sent. Thank you.')).toBeTruthy();
    expect(screen.getByText("Friday's review is confirmed.")).toBeTruthy();
  });

  it('never claims completion for a session the server has not marked submitted', async () => {
    const s = await repo.startConversation({ requestId: MOCK_IDS.confirmRequest, mode: 'CONFIRMATION' });
    await renderDone(s.id);
    expect(await screen.findByText('Not sent yet')).toBeTruthy();
    expect(screen.queryByText('Sent. Thank you.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Go to review' })).toBeTruthy();
  });

  it('falls back to generic copy when the server says it was submitted but the result is gone', async () => {
    const s = await repo.startConversation({ requestId: MOCK_IDS.confirmRequest, mode: 'CONFIRMATION' });
    const review = await repo.getReview(s.id);
    await repo.submitReview({ sessionId: s.id, idempotencyKey: 'k', items: review.items });
    await renderDone(s.id);
    expect(await screen.findByText('Sent. Thank you.')).toBeTruthy();
  });
});
