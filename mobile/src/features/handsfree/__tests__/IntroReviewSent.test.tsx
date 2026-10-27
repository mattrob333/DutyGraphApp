import React from 'react';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-haptics', () => ({ impactAsync: async () => {}, ImpactFeedbackStyle: { Light: 'light' } }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-crypto', () => ({ randomUUID: () => 'key-1234' }));
const mockStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK: 0,
  getItemAsync: async (k: string) => mockStore.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => void mockStore.set(k, v),
  deleteItemAsync: async (k: string) => void mockStore.delete(k),
}));
const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockDismissTo = jest.fn();
jest.mock('expo-router', () => ({
  router: { replace: (...a: unknown[]) => mockReplace(...a), push: (...a: unknown[]) => mockPush(...a), dismissTo: (...a: unknown[]) => mockDismissTo(...a) },
  useFocusEffect: () => {},
}));

import { usePreferencesStore } from '@/state/preferences';
import { useUiStore } from '@/state/ui';
import { CompanionApiError } from '@/types/domain';
import type { CardAnswer } from '@/types/handsfree';
import { IntroScreen } from '../IntroScreen';
import { ReviewScreen } from '../ReviewScreen';
import { SentScreen } from '../SentScreen';
import { newDraft, useDraftStore } from '../draft';
import { FakeRepo, REQUEST_ID, flush, questionSet, renderWithProviders } from '../__fixtures__/handsFree';

let repo: FakeRepo;

beforeEach(() => {
  mockStore.clear();
  mockReplace.mockClear();
  mockPush.mockClear();
  mockDismissTo.mockClear();
  useDraftStore.setState({ drafts: {} });
  useUiStore.setState({ offline: false, toast: null, sheet: null });
  usePreferencesStore.setState({ micConsented: false });
  repo = new FakeRepo();
});

describe('IntroScreen', () => {
  it('shows who is asking, how many questions, the short titles and the review promise', async () => {
    await renderWithProviders(<IntroScreen requestId={REQUEST_ID} />, repo);
    await flush();
    expect(screen.getByText(/^Questions from Alex Rivera · /)).toBeTruthy();
    expect(screen.getByText('6 quick questions about your work')).toBeTruthy();
    expect(screen.getByText("Read each card and just talk. When the chips turn green, tap Next. You'll review everything before it's sent.")).toBeTruthy();
    expect(screen.getByText('About 3 minutes')).toBeTruthy();
    for (const t of ['How a new order reaches you', 'Your tools', 'Where work waits', 'What you check and decide', 'Who you go to', 'What would make it easier']) {
      expect(screen.getByText(t)).toBeTruthy();
    }
    expect(screen.getByText("You can review everything before it's sent.")).toBeTruthy();
    expect(screen.queryByText(/score|percent|AI/)).toBeNull();
  });

  it('opens Why, the microphone explanation first, or the cards in typing', async () => {
    await renderWithProviders(<IntroScreen requestId={REQUEST_ID} />, repo);
    await flush();
    await fireEvent.press(screen.getByRole('button', { name: 'Why am I being asked this?' }));
    expect(useUiStore.getState().sheet?.paragraphs[0]).toMatch(/^Cobalt is working with Alex Rivera/);
    await fireEvent.press(screen.getByRole('button', { name: 'Start with voice' }));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/permissions/microphone', params: { questions: REQUEST_ID } });
    await fireEvent.press(screen.getByRole('button', { name: 'Type instead' }));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/questions/[requestId]/deck', params: { requestId: REQUEST_ID, mode: 'text' } });
  });

  it('goes straight to the cards once the microphone was explained', async () => {
    usePreferencesStore.setState({ micConsented: true });
    await renderWithProviders(<IntroScreen requestId={REQUEST_ID} />, repo);
    await flush();
    await fireEvent.press(screen.getByRole('button', { name: 'Start with voice' }));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/questions/[requestId]/deck', params: { requestId: REQUEST_ID, mode: 'voice' } });
  });
});

const set = questionSet();
const got = (raw: string): CardAnswer => ({ status: 'got', raw, covered: [] });

function seedDraft(answers: (CardAnswer | null)[]) {
  const d = newDraft(set, 'voice', new Date(Date.now() - 2 * 60_000));
  useDraftStore.getState().put({ ...d, answers: set.questions.map((_, i) => answers[i] ?? null) });
}

const POLISHED = 'Most orders arrive through the customer portal; a few still come by email.';

describe('ReviewScreen', () => {
  beforeEach(() => {
    repo.understood = {
      available: true,
      items: [
        { key: 'question.0', understood: POLISHED, suggestion: null },
        { key: 'question.1', understood: 'Outlook, the order system and one Excel sheet.', suggestion: 'Portal orders could go straight in.' },
        { key: 'question.2', understood: 'Orders wait for a credit check.', suggestion: 'Small overages might be pre-approved.' },
      ],
    };
    seedDraft([
      got('Most orders come in through the customer portal, and a few by email.'),
      got('Mostly the order system, plus Outlook and one Excel sheet.'),
      got('Orders wait when they need a credit check.'),
      null,
      { status: 'skipped', raw: "Hmm. I don't know yet.", covered: [], reason: 'dontknow' },
      { status: 'skipped', raw: '', covered: [], reason: 'someone' },
      got('Fridays are the busiest.'),
    ]);
  });

  it('asks once for the polished words and shows them editable, with skipped reasons and one note', async () => {
    await renderWithProviders(<ReviewScreen requestId={REQUEST_ID} />, repo);
    await flush();
    expect(screen.getByText("Here's what we heard")).toBeTruthy();
    expect(screen.getByText('Check it reads right. Change any word. Nothing is sent until you tap Send.')).toBeTruthy();
    expect(repo.understands).toHaveLength(1);
    expect(repo.understands[0].answers.map((a) => a.key)).toEqual(['question.0', 'question.1', 'question.2']);
    expect(screen.getByDisplayValue(POLISHED)).toBeTruthy();
    // "Anything else?" is never polished: the person's own words.
    expect(screen.getByDisplayValue('Fridays are the busiest.')).toBeTruthy();
    expect(screen.getByText("You don't know yet")).toBeTruthy();
    expect(screen.getByText('Someone else should answer')).toBeTruthy();
    expect(screen.getByText('Skipped')).toBeTruthy();
    expect(screen.getAllByText('A note for later')).toHaveLength(1);
    expect(screen.getByText('Portal orders could go straight in.')).toBeTruthy();
    await fireEvent.press(screen.getAllByRole('button', { name: 'Show what I said' })[0]);
    expect(screen.getByText('Your words')).toBeTruthy();
    expect(screen.getByText('Most orders come in through the customer portal, and a few by email.')).toBeTruthy();
  });

  it('shows the person’s own words when polishing is unavailable', async () => {
    repo.understood = { available: false, reason: 'NO_AI' };
    await renderWithProviders(<ReviewScreen requestId={REQUEST_ID} />, repo);
    await flush();
    expect(screen.getByDisplayValue('Most orders come in through the customer portal, and a few by email.')).toBeTruthy();
    expect(screen.queryByText('A note for later')).toBeNull();
  });

  it('sends edits once with a stable key and shows Sent only after the server answered', async () => {
    await renderWithProviders(<ReviewScreen requestId={REQUEST_ID} />, repo);
    await flush();
    await fireEvent.changeText(screen.getByDisplayValue(POLISHED), 'Orders come from the portal, some by email.');
    await flush();
    expect(useDraftStore.getState().drafts[REQUEST_ID]?.edits['question.0']).toBe('Orders come from the portal, some by email.');
    await fireEvent.press(screen.getByRole('button', { name: 'Send to Alex' }));
    await flush();
    expect(repo.submits).toHaveLength(1);
    const sent = repo.submits[0];
    expect(sent).toMatchObject({ requestId: REQUEST_ID, idempotencyKey: 'key-1234', expectedVersion: 3, contentHash: set.contentHash });
    expect(sent.submission.questionUnderstood?.['question.0']).toBe('Orders come from the portal, some by email.');
    expect(sent.submission.questionAnswers?.['question.0']).toBe('Most orders come in through the customer portal, and a few by email.');
    expect(sent.submission.questionResponses).toEqual({ 'question.4': 'unknown', 'question.5': 'wrong_role' });
    expect(sent.submission.responseText).toBe('Fridays are the busiest.');
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith({ pathname: '/questions/[requestId]/sent', params: { requestId: REQUEST_ID, advisor: 'Alex Rivera', took: 'That took about 2 minutes.' } }));
    expect(useDraftStore.getState().drafts[REQUEST_ID]).toBeUndefined();
  });

  it('keeps the answers and offers Try again with the same key when sending fails', async () => {
    repo.submitError = new CompanionApiError('SUBMIT_UNAVAILABLE', "Couldn't send just now.", 503, true);
    await renderWithProviders(<ReviewScreen requestId={REQUEST_ID} />, repo);
    await flush();
    await fireEvent.press(screen.getByRole('button', { name: 'Send to Alex' }));
    await flush();
    expect(screen.getByText('Not sent yet')).toBeTruthy();
    expect(screen.getByText('Your answers are safe on this phone.')).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(useDraftStore.getState().drafts[REQUEST_ID]?.idempotencyKey).toBe('key-1234');
    repo.submitError = null;
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    await flush();
    expect(repo.submits.map((s) => s.idempotencyKey)).toEqual(['key-1234', 'key-1234']);
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
  });

  it('Finish later keeps the draft and goes to Today', async () => {
    await renderWithProviders(<ReviewScreen requestId={REQUEST_ID} />, repo);
    await flush();
    await fireEvent.press(screen.getByRole('button', { name: 'Finish later' }));
    expect(mockDismissTo).toHaveBeenCalledWith('/today');
    expect(useUiStore.getState().toast?.title).toBe('Saved on this phone');
    expect(useDraftStore.getState().drafts[REQUEST_ID]).toBeTruthy();
    expect(repo.submits).toHaveLength(0);
  });

  it('shows the offline notice on the review', async () => {
    useUiStore.setState({ offline: true });
    await renderWithProviders(<ReviewScreen requestId={REQUEST_ID} />, repo);
    await flush();
    expect(screen.getByText("You're offline. Your answers are saved on this phone and will be sent when you're back online.")).toBeTruthy();
  });
});

describe('SentScreen', () => {
  it("says you're done, to whom it went and how long it took", async () => {
    await renderWithProviders(<SentScreen advisor="Alex Rivera" took="That took about 2 minutes." />, repo);
    await flush();
    expect(await screen.findByText("You're done. Thank you, Noah.")).toBeTruthy();
    expect(screen.getByText('Your answers went to Alex Rivera.')).toBeTruthy();
    expect(screen.getByText('That took about 2 minutes.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(mockDismissTo).toHaveBeenCalledWith('/today');
  });
});
