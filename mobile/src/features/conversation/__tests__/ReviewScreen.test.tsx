import React from 'react';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-haptics', () => ({ impactAsync: async () => {}, ImpactFeedbackStyle: { Light: 'light' } }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
const mockStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK: 0,
  getItemAsync: async (k: string) => mockStore.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => void mockStore.set(k, v),
  deleteItemAsync: async (k: string) => void mockStore.delete(k),
}));
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  router: { replace: (...a: unknown[]) => mockReplace(...a), push: jest.fn() },
  useFocusEffect: () => {},
}));

import { RepositoryProvider } from '@/api';
import { MOCK_IDS, MockCompanionRepository } from '@/api/mock/MockCompanionRepository';
import { ThemeProvider } from '@/theme';
import { useSimulationStore } from '@/state/simulation';
import { useUiStore } from '@/state/ui';
import { pendingSubmissions } from '@/storage/drafts';
import { ReviewScreen } from '../ReviewScreen';
import { useResultStore } from '../resultStore';

let repo: MockCompanionRepository;

function renderReview(sessionId: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  return render(
    <QueryClientProvider client={qc}>
      <RepositoryProvider repository={repo}>
        <ThemeProvider>
          <ReviewScreen sessionId={sessionId} />
        </ThemeProvider>
      </RepositoryProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockStore.clear();
  mockReplace.mockClear();
  useSimulationStore.getState().reset();
  useUiStore.setState({ toast: null });
  useResultStore.setState({ results: {} });
  repo = new MockCompanionRepository();
  repo.latency = 0;
});

describe('ReviewScreen', () => {
  it('shows the processing state, then the proposal chip, title and cards, with 0 of N checked', async () => {
    const s = await repo.startConversation({ requestId: MOCK_IDS.confirmRequest, mode: 'CONFIRMATION' });
    await renderReview(s.id);
    expect(screen.getByText('Putting it together…')).toBeTruthy();
    expect(await screen.findByText('Our understanding · not confirmed')).toBeTruthy();
    expect(screen.getByText("Here's what we understood")).toBeTruthy();
    expect(screen.getByText('0 of 2 checked')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeTruthy(); // submitLabel
    expect(screen.getByRole('button', { name: 'Finish later' })).toBeTruthy();
  });

  it('confirming and changing update the checked count; the sheet says "Say it your way"', async () => {
    const s = await repo.startConversation({ requestId: MOCK_IDS.confirmRequest, mode: 'CONFIRMATION' });
    await renderReview(s.id);
    await screen.findByText('0 of 2 checked');
    await fireEvent.press(screen.getAllByRole('button', { name: 'Looks right' })[0]);
    expect(await screen.findByText('1 of 2 checked')).toBeTruthy();
    await fireEvent.press(screen.getAllByRole('button', { name: 'Change wording' })[1]);
    expect(await screen.findByText('Say it your way')).toBeTruthy();
    expect(screen.getByText('Your wording replaces ours.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Your wording'), 'I will confirm cutoff times by 3 PM.');
    await fireEvent.press(screen.getByRole('button', { name: 'Save wording' }));
    expect(await screen.findByText('I will confirm cutoff times by 3 PM.')).toBeTruthy();
    expect(screen.getByText('Your wording')).toBeTruthy();
    expect(screen.getByText('2 of 2 checked')).toBeTruthy();
  });

  it('submits the reviewed wording with a key saved BEFORE the call, then shows done only after the server acknowledges', async () => {
    const s = await repo.startConversation({ requestId: MOCK_IDS.confirmRequest, mode: 'CONFIRMATION' });
    const calls: { key: string; texts: (string | undefined)[]; savedBefore: boolean }[] = [];
    const original = repo.submitReview.bind(repo);
    repo.submitReview = async (input) => {
      const saved = await pendingSubmissions.get(input.sessionId);
      calls.push({ key: input.idempotencyKey, texts: input.items.map((i) => i.participantEditedText), savedBefore: saved?.idempotencyKey === input.idempotencyKey });
      return original(input);
    };
    await renderReview(s.id);
    await screen.findByText('0 of 2 checked');
    await fireEvent.press(screen.getAllByRole('button', { name: 'Change wording' })[0]);
    await fireEvent.changeText(await screen.findByLabelText('Your wording'), 'Northline is late most mornings.');
    await fireEvent.press(screen.getByRole('button', { name: 'Save wording' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(mockReplace).toHaveBeenCalled(), { timeout: 3000 });
    expect(calls).toHaveLength(1);
    expect(calls[0].savedBefore).toBe(true);
    expect(calls[0].texts[0]).toBe('Northline is late most mornings.');
    expect(mockReplace.mock.calls[0][0]).toMatchObject({ pathname: '/session/[sessionId]/done', params: { sessionId: s.id } });
    expect(useResultStore.getState().results[s.id].result.headline).toBe('Sent. Thank you.');
    expect(await pendingSubmissions.get(s.id)).toBeNull();
  });

  it('on failure shows the send error, keeps the answers saved, and Try again reuses the SAME key', async () => {
    const s = await repo.startConversation({ requestId: MOCK_IDS.confirmRequest, mode: 'CONFIRMATION' });
    const keys: string[] = [];
    const original = repo.submitReview.bind(repo);
    repo.submitReview = async (input) => {
      keys.push(input.idempotencyKey);
      return original(input);
    };
    await renderReview(s.id);
    await screen.findByText('0 of 2 checked');
    useSimulationStore.getState().set({ failSend: true });
    await fireEvent.press(screen.getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByText("Couldn't send")).toBeTruthy();
    expect(screen.getByText(/saved on this phone/)).toBeTruthy();
    expect(screen.getByText('Saved on this device')).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
    expect((await pendingSubmissions.get(s.id))?.idempotencyKey).toBe(keys[0]);

    useSimulationStore.getState().set({ failSend: false });
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(mockReplace).toHaveBeenCalled(), { timeout: 3000 });
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
  });

  it('submitting without checking every card is allowed', async () => {
    const s = await repo.startConversation({ requestId: MOCK_IDS.confirmRequest, mode: 'CONFIRMATION' });
    await renderReview(s.id);
    await screen.findByText('0 of 2 checked');
    await fireEvent.press(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(mockReplace).toHaveBeenCalled(), { timeout: 3000 });
    expect(useResultStore.getState().results[s.id].summary).toMatchObject({ total: 2, unchecked: 2 });
  });

  it('wrap-up goes to the created commitment with a toast', async () => {
    const s = await repo.startConversation({ requestId: 'req-wrapup-x', mode: 'MEETING_WRAP_UP' });
    await renderReview(s.id);
    await screen.findByText('0 of 3 checked');
    expect(screen.getByRole('button', { name: 'Accept' })).toBeTruthy();
    expect(screen.queryByText('Add something we missed')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Confirm meeting outcome' }));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/work/commitments/c-fallback'), { timeout: 3000 });
    expect(useUiStore.getState().toast).toMatchObject({ title: 'Added to your commitments' });
  });

  it('Finish later saves nothing to send: it toasts and returns to Today', async () => {
    const s = await repo.startConversation({ requestId: MOCK_IDS.confirmRequest, mode: 'CONFIRMATION' });
    await renderReview(s.id);
    await screen.findByText('0 of 2 checked');
    await fireEvent.press(screen.getByRole('button', { name: 'Finish later' }));
    expect(mockReplace).toHaveBeenCalledWith('/today');
    expect(await pendingSubmissions.list()).toEqual([]);
    expect(useUiStore.getState().toast).toMatchObject({ title: 'Saved on this device' });
  });
});
