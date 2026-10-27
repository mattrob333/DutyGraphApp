/**
 * Runs one hands-free deck (docs/specs/COMPANION-HANDS-FREE.md §6.2) on the shared reducer
 * (`@shared/hands-free/deck`). The reducer owns every rule; this hook only connects it to the
 * world:
 *
 * - **Timers:** the one timer the reducer asks for (`deckTimer`) is scheduled and sent back.
 * - **Microphone:** live speech starts and stops as `deckMic` says, tagged with its session, so
 *   late words can never reach another card. It also stops on blur, background and unmount (the
 *   deck pauses, and the person resumes it).
 * - **Coverage:** the reducer ticks chips from the words with `coverLocally` as they arrive. When
 *   it asks (`deckServerCheck`), the server check runs, raced with a 2.5 s limit; whatever comes
 *   back is merged with the local result and filtered to the card's own hints. Nudges always come
 *   from the hint table, never from model text.
 * - **Announcements** go to VoiceOver / TalkBack; **answers** are handed to the caller (draft).
 */
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  DECK_TIMING,
  createDeck,
  deckMic,
  deckReducer,
  deckServerCheck,
  deckTimer,
  type DeckMode,
  type DeckState,
} from '@shared/hands-free/deck';
import { coverLocally, mergeCoverage } from '@shared/hands-free/coverage';
import type { CompanionRepository } from '@/api/repository';
import type { LiveSpeech, LiveSpeechError } from '@/features/voice/live';
import { useUiStore } from '@/state/ui';
import type { CardAnswer, QuestionSet } from '@/types/handsfree';

/** Where the deck's timers come from. Tests pass a manual clock. */
export interface DeckClock {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export const realClock: DeckClock = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

/** Why the microphone is off for good in this run: the note above the typing box. */
export type MicBlock = 'permission' | 'unavailable' | null;

export interface HandsFreeDeckOptions {
  set: QuestionSet;
  mode: DeckMode;
  /** A saved draft: the deck starts at the first unanswered card. */
  answers?: (CardAnswer | null)[];
  speech: LiveSpeech;
  repo: Pick<CompanionRepository, 'checkCoverage'>;
  /** The microphone is known to be blocked before starting (typing with the note). */
  micBlock?: MicBlock;
  clock?: DeckClock;
  lang?: string;
  /** Every change of the answers or the mode (save it as the draft). */
  onAnswers?: (answers: (CardAnswer | null)[], mode: DeckMode) => void;
  /** Every card is done: go to "Here's what we heard". */
  onDone?: (answers: (CardAnswer | null)[]) => void;
}

export function useHandsFreeDeck(o: HandsFreeDeckOptions) {
  const clock = o.clock ?? realClock;
  const offline = useUiStore((s) => s.offline);
  const [micBlock, setMicBlock] = useState<MicBlock>(o.micBlock ?? null);
  const [state, dispatch] = useReducer(deckReducer, undefined, () =>
    createDeck(o.set.questions, { mode: o.mode, micBlocked: !!o.micBlock, serverCheck: true, offline, answers: o.answers }),
  );
  const alive = useRef(true);
  const latest = useRef(o);
  latest.current = o;

  // Timers: the one the reducer wants, by id.
  const timer = deckTimer(state);
  useEffect(() => {
    if (!timer) return;
    const id = timer.id;
    const h = clock.set(() => dispatch({ type: 'timer', id }), timer.ms);
    return () => clock.clear(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer?.id]);

  // Microphone: restart on each new session, stop when off. Calls are queued so a stop can never
  // overtake the start before it.
  const mic = deckMic(state);
  const micKey = mic.on ? mic.session : -1;
  const script = useRef(mic.script);
  script.current = mic.script;
  const queue = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    const session = mic.session;
    const on = mic.on;
    const speech = latest.current.speech;
    queue.current = queue.current.then(async () => {
      await speech.stop().catch(() => {});
      if (!on || !alive.current) return;
      const onError = (e: LiveSpeechError) => {
        if (e.code === 'permission_denied') setMicBlock('permission');
        if (e.code === 'not_available') setMicBlock('unavailable');
        dispatch({ type: 'speechError', code: e.code, session });
      };
      try {
        await speech.start(
          { lang: latest.current.lang ?? 'en-US', script: script.current ?? undefined },
          {
            // The phone's own recognizer (expo-speech-recognition): "Transcribed from voice on their device".
            onText: (text) => dispatch({ type: 'speech', session, text, via: 'voice_device' }),
            onPause: () => dispatch({ type: 'speechEnd', session }),
            onError,
          },
        );
      } catch {
        onError({ code: 'other' });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [micKey]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      const speech = latest.current.speech;
      queue.current = queue.current.then(() => speech.stop().catch(() => {}));
    };
  }, []);

  // Leaving the screen or the app pauses the deck, which turns the microphone off.
  useFocusEffect(useCallback(() => () => dispatch({ type: 'pause' }), []));
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') dispatch({ type: 'pause' });
    });
    return () => sub.remove();
  }, []);

  // The server check, raced with the most the deck waits for it.
  const check = deckServerCheck(state);
  useEffect(() => {
    if (!check) return;
    const { checkId, questionKey, text } = check;
    const hints = state.questions[state.idx]?.hints ?? [];
    let settled = false;
    const finish = (covered: string[] | null) => {
      if (settled) return;
      settled = true;
      clock.clear(h);
      dispatch({ type: 'serverCoverage', checkId, covered });
    };
    const h = clock.set(() => finish(null), DECK_TIMING.serverWaitMax);
    latest.current.repo
      .checkCoverage({ requestId: latest.current.set.requestId, questionKey, text })
      .then((r) => finish(r.available ? mergeCoverage(coverLocally(text, hints), r.result.covered, hints).covered : null))
      .catch(() => finish(null));
    return () => {
      settled = true;
      clock.clear(h);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [check?.checkId]);

  // Connection.
  useEffect(() => {
    dispatch({ type: 'online', online: !offline });
  }, [offline]);

  // Screen readers hear each new announcement (web: the live region on the screen).
  useEffect(() => {
    if (!state.announceId || !state.announce || Platform.OS === 'web') return;
    AccessibilityInfo.announceForAccessibility(state.announce);
  }, [state.announceId, state.announce]);

  // Answers and mode to the caller (the draft); the end of the deck.
  useEffect(() => {
    latest.current.onAnswers?.(state.answers, state.mode);
  }, [state.answers, state.mode]);
  const done = state.phase === 'done';
  useEffect(() => {
    if (done) latest.current.onDone?.(state.answers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  return { state, send: dispatch, micBlock };
}

export type { DeckState };
