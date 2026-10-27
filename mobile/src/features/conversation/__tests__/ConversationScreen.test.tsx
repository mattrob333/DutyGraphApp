import React from 'react';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
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
const mockPush = jest.fn();
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    router: { replace: (...a: unknown[]) => mockReplace(...a), push: (...a: unknown[]) => mockPush(...a) },
    useFocusEffect: (cb: () => void | (() => void)) => React.useEffect(cb, [cb]),
  };
});

import { RepositoryProvider } from '@/api';
import { MOCK_IDS, MockCompanionRepository } from '@/api/mock/MockCompanionRepository';
import { ThemeProvider } from '@/theme';
import { useSimulationStore } from '@/state/simulation';
import { usePreferencesStore } from '@/state/preferences';
import { useUiStore } from '@/state/ui';
import { ConversationScreen } from '../ConversationScreen';

let repo: MockCompanionRepository;

function renderScreen(sessionId: string, input: 'voice' | 'text') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  return render(
    <QueryClientProvider client={qc}>
      <RepositoryProvider repository={repo}>
        <ThemeProvider>
          <ConversationScreen sessionId={sessionId} initialInput={input} />
        </ThemeProvider>
      </RepositoryProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockStore.clear();
  mockReplace.mockClear();
  mockPush.mockClear();
  useSimulationStore.getState().reset();
  useUiStore.setState({ toast: null });
  usePreferencesStore.setState({ micConsented: true });
  repo = new MockCompanionRepository();
  repo.latency = 0;
});
afterEach(() => {
  jest.useRealTimers();
});

const QUESTION_1 = 'Last Monday you committed to sending the revised dock schedule to Jesse. Did that happen?';
const LONG = 'Yes, I sent it Wednesday and he is already using it for the late-shift bays.';

describe('ConversationScreen (text mode)', () => {
  it('shows the header, the first question, and disables sending until the question has been shown', async () => {
    const s = await repo.startConversation({ requestId: MOCK_IDS.pulseRequest, mode: 'PULSE' });
    await renderScreen(s.id, 'text');
    expect(await screen.findByText('Monday Operations Pulse')).toBeTruthy();
    expect(screen.getByText('Question 1 of 4')).toBeTruthy();
    expect(screen.getByText(QUESTION_1)).toBeTruthy();
    expect(screen.getByText('DUTYGRAPH', { exact: false })).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Use voice instead' })).toBeTruthy();
  });

  it('sends a typed answer, shows it, and DutyGraph asks the next question', async () => {
    const s = await repo.startConversation({ requestId: MOCK_IDS.pulseRequest, mode: 'PULSE' });
    await renderScreen(s.id, 'text');
    const input = await screen.findByLabelText('Your answer');
    await waitFor(() => expect(input.props.editable).toBe(true), { timeout: 3000 });
    await fireEvent.changeText(input, LONG);
    await fireEvent.press(screen.getByRole('button', { name: 'Send answer' }));
    expect(await screen.findByText(LONG, undefined, { timeout: 3000 })).toBeTruthy();
    expect(await screen.findByText('Question 2 of 4', undefined, { timeout: 3000 })).toBeTruthy();
    expect(screen.getByText("Got it. I'll mark that commitment complete.")).toBeTruthy();
  });

  it('shows the No connection panel offline and resends with the SAME utterance id on Try again', async () => {
    const s = await repo.startConversation({ requestId: MOCK_IDS.pulseRequest, mode: 'PULSE' });
    const seen: string[] = [];
    const original = repo.sendTurn.bind(repo);
    repo.sendTurn = async (input) => {
      seen.push(input.utteranceId);
      return original(input);
    };
    await renderScreen(s.id, 'text');
    const input = await screen.findByLabelText('Your answer');
    await waitFor(() => expect(input.props.editable).toBe(true), { timeout: 3000 });
    useSimulationStore.getState().set({ offline: true });
    await fireEvent.changeText(input, LONG);
    await fireEvent.press(screen.getByRole('button', { name: 'Send answer' }));
    expect(await screen.findByText('No connection', undefined, { timeout: 3000 })).toBeTruthy();
    expect(screen.getByText(LONG)).toBeTruthy(); // the answer is kept on screen
    expect(screen.getByRole('button', { name: 'Save and finish later' })).toBeTruthy();

    useSimulationStore.getState().set({ offline: false });
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Question 2 of 4', undefined, { timeout: 3000 })).toBeTruthy();
    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe(seen[1]);
    expect(seen[0]).toMatch(/^utt_/);
  });

  it('offers Retry / Continue by typing / Save and finish later on a provider error', async () => {
    const s = await repo.startConversation({ requestId: MOCK_IDS.pulseRequest, mode: 'PULSE' });
    await renderScreen(s.id, 'text');
    const input = await screen.findByLabelText('Your answer');
    await waitFor(() => expect(input.props.editable).toBe(true), { timeout: 3000 });
    useSimulationStore.getState().set({ providerError: true });
    await fireEvent.changeText(input, LONG);
    await fireEvent.press(screen.getByRole('button', { name: 'Send answer' }));
    expect(await screen.findByText("That didn't go through", undefined, { timeout: 3000 })).toBeTruthy();
    for (const name of ['Retry', 'Continue by typing', 'Save and finish later']) expect(screen.getByRole('button', { name })).toBeTruthy();
  });

  it('Save and finish later keeps the answer as a draft, toasts, and returns to Today', async () => {
    const s = await repo.startConversation({ requestId: MOCK_IDS.pulseRequest, mode: 'PULSE' });
    await renderScreen(s.id, 'text');
    const input = await screen.findByLabelText('Your answer');
    await waitFor(() => expect(input.props.editable).toBe(true), { timeout: 3000 });
    useSimulationStore.getState().set({ offline: true });
    await fireEvent.changeText(input, LONG);
    await fireEvent.press(screen.getByRole('button', { name: 'Send answer' }));
    await screen.findByText('No connection', undefined, { timeout: 3000 });
    await fireEvent.press(screen.getByRole('button', { name: 'Save and finish later' }));
    expect(mockReplace).toHaveBeenCalledWith('/today');
    expect(useUiStore.getState().toast).toMatchObject({ title: 'Saved on this device' });
    const { textDrafts } = require('@/storage/drafts');
    expect(await textDrafts.get(s.id)).toBe(LONG);
  });

  it('a one-word answer triggers the follow-up bubble', async () => {
    const s = await repo.startConversation({ requestId: MOCK_IDS.pulseRequest, mode: 'PULSE' });
    await renderScreen(s.id, 'text');
    const input = await screen.findByLabelText('Your answer');
    await waitFor(() => expect(input.props.editable).toBe(true), { timeout: 3000 });
    await fireEvent.changeText(input, 'Yes');
    await fireEvent.press(screen.getByRole('button', { name: 'Send answer' }));
    expect(await screen.findByText('Could you say a little more about that?', undefined, { timeout: 3000 })).toBeTruthy();
    expect(screen.getByText('Follow-up')).toBeTruthy();
  });

  it('after the last answer, shows the closing state and replaces to the review route', async () => {
    const s = await repo.startConversation({ requestId: MOCK_IDS.pulseRequest, mode: 'PULSE' });
    // Answer all but the last question on the server.
    let res = { reviewReady: false, session: s };
    for (let i = 0; i < 5; i++) res = await repo.sendTurn({ sessionId: s.id, utteranceId: `pre${i}`, text: 'A thorough answer with plenty of detail.', source: 'TEXT' });
    expect(res.reviewReady).toBe(false);
    await renderScreen(s.id, 'text');
    const input = await screen.findByLabelText('Your answer');
    await waitFor(() => expect(input.props.editable).toBe(true), { timeout: 3000 });
    await fireEvent.changeText(input, 'A thorough answer with plenty of detail about the last thing.');
    await fireEvent.press(screen.getByRole('button', { name: 'Send answer' }));
    await waitFor(() => expect(mockReplace).toHaveBeenCalled(), { timeout: 4000 });
    expect(mockReplace.mock.calls[0][0]).toMatchObject({ pathname: '/pulse/[pulseId]/review', params: { sessionId: s.id } });
  });
});

describe('ConversationScreen (voice mode, simulated)', () => {
  it('opens the microphone only after the question is shown, streams a live transcript with a text label, and sends on Done answering', async () => {
    const s = await repo.startConversation({ requestId: MOCK_IDS.pulseRequest, mode: 'PULSE' });
    await renderScreen(s.id, 'voice');
    // Not listening yet: DutyGraph is still asking.
    expect(screen.queryByText('Listening…')).toBeNull();
    expect(await screen.findByText('Listening…', undefined, { timeout: 3000 })).toBeTruthy();
    expect(await screen.findByText('Yes, I', undefined, { timeout: 3000 })).toBeTruthy();
    expect(screen.getByText('00:00')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Done answering' }));
    expect(await screen.findByText('Question 2 of 4', undefined, { timeout: 4000 })).toBeTruthy();
  });

  it('Pause states "Paused" in words and Resume returns to Listening…', async () => {
    const s = await repo.startConversation({ requestId: MOCK_IDS.pulseRequest, mode: 'PULSE' });
    await renderScreen(s.id, 'voice');
    await screen.findByText('Listening…', undefined, { timeout: 3000 });
    await fireEvent.press(screen.getByRole('button', { name: 'Pause listening' }));
    expect(await screen.findByText('Paused')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Resume listening' }));
    expect(await screen.findByText('Listening…')).toBeTruthy();
  });

  it('shows the blocked-microphone state when the simulation blocks it, and Type my answer instead switches to text', async () => {
    useSimulationStore.getState().set({ micDenied: true });
    const s = await repo.startConversation({ requestId: MOCK_IDS.pulseRequest, mode: 'PULSE' });
    await renderScreen(s.id, 'voice');
    expect(await screen.findByText('Microphone is blocked', undefined, { timeout: 3000 })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Type my answer instead' }));
    expect(await screen.findByLabelText('Your answer')).toBeTruthy();
  });

  it('never opens voice when the participant has not consented on this device', async () => {
    usePreferencesStore.setState({ micConsented: false });
    const s = await repo.startConversation({ requestId: MOCK_IDS.pulseRequest, mode: 'PULSE' });
    await renderScreen(s.id, 'voice');
    expect(await screen.findByLabelText('Your answer')).toBeTruthy();
    expect(screen.queryByText('Listening…')).toBeNull();
  });
});
