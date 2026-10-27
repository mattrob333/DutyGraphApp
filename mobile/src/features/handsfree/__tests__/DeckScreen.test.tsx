import React from 'react';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, screen } from '@testing-library/react-native';

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
  router: { replace: (...a: unknown[]) => mockReplace(...a), push: jest.fn(), dismissTo: jest.fn() },
  useFocusEffect: () => {},
}));

import { useUiStore } from '@/state/ui';
import { useSimulationStore } from '@/state/simulation';
import { usePreferencesStore } from '@/state/preferences';
import { DeckScreen } from '../DeckScreen';
import { useDraftStore } from '../draft';
import { ANSWER_1, FakeRepo, FakeSpeech, ManualClock, REQUEST_ID, flush, questionSet, renderWithProviders } from '../__fixtures__/handsFree';

let repo: FakeRepo;
let speech: FakeSpeech;
let clock: ManualClock;

async function renderDeck(mode: 'voice' | 'text' = 'voice') {
  await renderWithProviders(<DeckScreen requestId={REQUEST_ID} mode={mode} speech={speech} clock={clock} />, repo);
  await flush();
}

/** Card shown → microphone on (1300 ms). */
/** A spoken card never moves on by itself (October 18): tap Next. */
async function pressNext() {
  await fireEvent.press(screen.getByRole('button', { name: /^Next/ }));
  await flush();
}

async function startListening() {
  await clock.fire(1300);
  expect(speech.on).toBe(true);
}

beforeEach(() => {
  mockStore.clear();
  mockReplace.mockClear();
  useDraftStore.setState({ drafts: {} });
  useUiStore.setState({ offline: false, toast: null });
  useSimulationStore.getState().reset();
  repo = new FakeRepo();
  speech = new FakeSpeech();
  clock = new ManualClock();
});

describe('DeckScreen (hands-free cards)', () => {
  it('shows the first card ready, with its chips and the empty caption', async () => {
    await renderDeck();
    expect(screen.getByText('Question 1 of 6')).toBeTruthy();
    expect(screen.getByText('From Alex Rivera')).toBeTruthy();
    expect(screen.getByText('Walk me through how a new order reaches you.')).toBeTruthy();
    expect(screen.getAllByText('Try to cover').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Where it comes from')).toBeTruthy();
    expect(screen.getByText("Start talking whenever you're ready")).toBeTruthy();
    expect(screen.getByText('Listening…')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Skip' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Type instead' })).toBeTruthy();
    expect(speech.on).toBe(false);
    expect(clock.pending).toContain(1300);
  });

  it('listens with live captions and ticks chips as they are heard', async () => {
    await renderDeck();
    await startListening();
    expect(speech.starts[0].script).toEqual({ questionIndex: 0, attempt: 0 });
    await speech.say(ANSWER_1.first);
    expect(screen.getByText(ANSWER_1.first)).toBeTruthy();
    expect(screen.getByLabelText('Where it comes from, covered')).toBeTruthy();
    expect(screen.getByLabelText('What you do first')).toBeTruthy();
  });

  it('shows Got it with Keep talking, which reopens the card', async () => {
    await renderDeck();
    await startListening();
    await speech.say(`${ANSWER_1.first} ${ANSWER_1.second} ${ANSWER_1.third}`);
    await clock.fire(900);
    expect(screen.getByText('Checking')).toBeTruthy();
    await clock.fire(750);
    expect(screen.queryByText('Got it')).toBeNull();
    await pressNext();
    expect(screen.getByText('Got it')).toBeTruthy();
    expect(useDraftStore.getState().drafts[REQUEST_ID]?.answers[0]?.status).toBe('got');
    await fireEvent.press(screen.getByRole('button', { name: 'Keep talking' }));
    await flush();
    expect(screen.queryByText('Got it')).toBeNull();
    expect(screen.getByText('Listening…')).toBeTruthy();
    expect(speech.on).toBe(true);
    expect(useDraftStore.getState().drafts[REQUEST_ID]?.answers[0]).toBeNull();
  });

  it('records that the words came from the phone\'s recognizer, and typing on the card', async () => {
    await renderDeck();
    await startListening();
    await speech.say(`${ANSWER_1.first} ${ANSWER_1.second} ${ANSWER_1.third}`);
    await clock.fire(900);
    await clock.fire(750);
    await pressNext();
    expect(useDraftStore.getState().drafts[REQUEST_ID]?.answers[0]?.input).toEqual({ voice: 'voice_device' });
  });

  it('never moves on by itself: Next lights up, and Next moves on after Got it', async () => {
    await renderDeck();
    await startListening();
    await speech.say(`${ANSWER_1.first} ${ANSWER_1.second} ${ANSWER_1.third}`);
    await clock.fire(900);
    await clock.fire(750);
    expect(screen.getByRole('button', { name: 'Next. That covers it' })).toBeTruthy();
    // No timer is left that could end the card: it waits for the person.
    expect(clock.pending).toEqual([]);
    expect(screen.getByText('Question 1 of 6')).toBeTruthy();
    expect(speech.on).toBe(true);
    await pressNext();
    await clock.fire(1300);
    expect(screen.getByText('Question 2 of 6')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Previous question' })).toBeTruthy();
  });

  it('asks for a bit more with the hint nudge (never model text)', async () => {
    repo.coverage = { available: true, result: { covered: [], nudge: 'MODEL TEXT', source: 'server' } };
    await renderDeck();
    await startListening();
    await speech.say(`${ANSWER_1.first} ${ANSWER_1.second}`);
    await clock.fire(900);
    await clock.fire(750);
    expect(screen.getByText('…and who picks it up after you?')).toBeTruthy();
    expect(screen.queryByText('MODEL TEXT')).toBeNull();
    expect(screen.getByLabelText('Who gets it next')).toBeTruthy();
  });

  it('merges the server check with the local one, filtered to the card hints', async () => {
    repo.coverage = { available: true, result: { covered: ['h2', 'not-a-hint'], nudge: null, source: 'server' } };
    await renderDeck();
    await startListening();
    await speech.say(`${ANSWER_1.first} ${ANSWER_1.second}`);
    expect(screen.getByLabelText('Who gets it next')).toBeTruthy();
    await clock.fire(900);
    await clock.fire(750);
    expect(screen.getByLabelText('Who gets it next, covered')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next. That covers it' })).toBeTruthy();
  });

  it('stops waiting for a slow server check; the local result stands', async () => {
    repo.checkCoverage = () => new Promise(() => {});
    await renderDeck();
    await startListening();
    await speech.say(`${ANSWER_1.first} ${ANSWER_1.second}`);
    await clock.fire(900);
    await clock.fire(750);
    expect(screen.getByText('Checking')).toBeTruthy();
    await clock.fire(1750);
    expect(screen.getByText('…and who picks it up after you?')).toBeTruthy();
  });

  it('cross-fades instead of sliding with reduced motion', async () => {
    usePreferencesStore.setState({ reduceMotion: true });
    try {
      await renderDeck();
      await startListening();
      await speech.say(`${ANSWER_1.first} ${ANSWER_1.second} ${ANSWER_1.third}`);
      await clock.fire(900);
      await clock.fire(750);
      await pressNext();
      expect(screen.getByText('Got it')).toBeTruthy();
      await clock.fire(1300);
      expect(screen.getByText('Question 2 of 6')).toBeTruthy();
    } finally {
      await act(async () => usePreferencesStore.setState({ reduceMotion: false }));
    }
  });

  it('skips through the sheet with the reason on the card', async () => {
    await renderDeck();
    await startListening();
    await fireEvent.press(screen.getByRole('button', { name: 'Skip' }));
    await flush();
    expect(screen.getByText('Skip this one?')).toBeTruthy();
    expect(speech.on).toBe(false);
    await fireEvent.press(screen.getByRole('button', { name: "I don't know yet" }));
    await flush();
    expect(screen.getByText("You don't know yet")).toBeTruthy();
    expect(useDraftStore.getState().drafts[REQUEST_ID]?.answers[0]).toMatchObject({ status: 'skipped', reason: 'dontknow' });
  });

  it('pauses: microphone off, Paused on the card, Resume in the bar', async () => {
    await renderDeck();
    await startListening();
    await speech.say('Mostly the order system');
    await fireEvent.press(screen.getByRole('button', { name: 'Pause' }));
    await flush();
    expect(speech.on).toBe(false);
    expect(screen.getByText('Paused · mic off')).toBeTruthy();
    expect(screen.getByLabelText('Paused')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Resume' }));
    await flush();
    expect(screen.getByText('Listening…')).toBeTruthy();
  });

  it('types an answer and moves on with Next', async () => {
    await renderDeck('text');
    expect(screen.queryByText('Listening…')).toBeNull();
    expect(screen.queryByText('Your microphone is blocked.')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Your answer'), `${ANSWER_1.first} ${ANSWER_1.second} ${ANSWER_1.third}`);
    await flush();
    expect(screen.getByLabelText('Who gets it next, covered')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    await flush();
    expect(screen.getByText('Got it')).toBeTruthy();
    expect(speech.starts).toHaveLength(0);
  });

  it('falls back to typing with a note when the microphone is blocked', async () => {
    await renderDeck();
    await startListening();
    await speech.fail('permission_denied');
    await flush();
    expect(screen.getByText('Your microphone is blocked.')).toBeTruthy();
    expect(screen.getByLabelText('Your answer')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Use voice' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next' })).toBeTruthy();
  });

  it('starts in typing when the demo microphone is blocked', async () => {
    useSimulationStore.getState().set({ micDenied: true });
    speech = new FakeSpeech('simulated');
    await renderDeck();
    expect(screen.getByText('Your microphone is blocked.')).toBeTruthy();
    expect(clock.pending).not.toContain(1300);
  });

  it('offers Try again or Type instead after a speech error', async () => {
    await renderDeck();
    await startListening();
    await speech.fail('network');
    expect(screen.getByText("We couldn't hear that. Try again or type instead.")).toBeTruthy();
    expect(speech.on).toBe(false);
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    await flush();
    expect(screen.queryByText("We couldn't hear that. Try again or type instead.")).toBeNull();
    expect(speech.on).toBe(true);
  });

  it('shows the offline notice and keeps going', async () => {
    await renderDeck();
    await flush();
    await act(async () => useUiStore.setState({ offline: true }));
    await flush();
    expect(screen.getByText("You're offline. Your answers are saved on this phone and will be sent when you're back online.")).toBeTruthy();
    await startListening();
  });

  it('goes back to a past card with You said and Add more', async () => {
    await renderDeck();
    await startListening();
    await speech.say(`${ANSWER_1.first} ${ANSWER_1.second} ${ANSWER_1.third}`);
    await clock.fire(900);
    await clock.fire(750);
    await pressNext();
    await clock.fire(1300);
    await fireEvent.press(screen.getByRole('button', { name: 'Previous question' }));
    await flush();
    expect(screen.getByText('You said:', { exact: false })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back to question 2' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Add more to question 1' }));
    await flush();
    expect(screen.getByText('Question 1 of 6')).toBeTruthy();
    expect(speech.on).toBe(true);
  });

  it('runs a whole deck by voice, a tap on Next per card, then opens the review', async () => {
    repo = new FakeRepo(questionSet([QUESTION]));
    await renderDeck();
    await startListening();
    await speech.say(`${ANSWER_1.first} ${ANSWER_1.second} ${ANSWER_1.third}`);
    await clock.fire(900);
    await clock.fire(750);
    await pressNext();
    await clock.fire(1300);
    expect(screen.getAllByText('One last thing')).toHaveLength(2);
    expect(screen.getByText('Anything else Alex should know about your work?')).toBeTruthy();
    expect(screen.getByRole('button', { name: "No, that's all" })).toBeTruthy();
    await clock.fire(1300);
    await clock.fire(5000);
    expect(mockReplace).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: "No, that's all" }));
    await flush();
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/questions/[requestId]/review', params: { requestId: REQUEST_ID } });
    const draft = useDraftStore.getState().drafts[REQUEST_ID];
    expect(draft?.answers.map((a) => a?.status ?? null)).toEqual(['got', null]);
  });

  it('resumes a saved draft at the first unanswered card', async () => {
    const set = questionSet();
    useDraftStore.getState().put({
      v: 1,
      requestId: REQUEST_ID,
      contentHash: set.contentHash,
      keys: set.questions.map((q) => q.key),
      answers: set.questions.map((_, i) => (i < 2 ? { status: 'got' as const, raw: 'Earlier words.', covered: [] } : null)),
      mode: 'voice',
      startedAt: new Date().toISOString(),
      edits: {},
    });
    await renderDeck();
    expect(screen.getByText('Question 3 of 6')).toBeTruthy();
  });
});

const QUESTION = 'Walk me through how a new order reaches you.';
