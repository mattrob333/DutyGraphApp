/**
 * Live speech for the hands-free cards (docs/specs/COMPANION-HANDS-FREE.md §5). The deck hook
 * calls `createLiveSpeech()` once per deck and drives it with `deckMic`.
 */
import { Platform } from 'react-native';
import { OpenAiLiveSpeech, unavailablePcmCapture, type PcmCapture, type TranscriptionGrant } from './openai';
import { createBrowserPcmCapture } from './browserPcm';
import { ResilientLiveSpeech } from './resilient';
import { config, type DataSource } from '@/api/config';
import { scriptedSentences } from '@/api/mock/handsFree';
import { simulationFlags } from '@/state/simulation';
import { loadSpeechModule, NativeLiveSpeech, type SpeechModuleLike } from './native';
import { SimulatedLiveSpeech } from './simulated';
import type { LiveSpeech, LiveSpeechKind } from './types';
import { UnavailableLiveSpeech } from './unavailable';

export * from './types';
export { NativeLiveSpeech, loadSpeechModule, type SpeechModuleLike } from './native';
export { SimulatedLiveSpeech, type SimulatedLiveSpeechOptions } from './simulated';
export { UnavailableLiveSpeech } from './unavailable';

export interface CreateLiveSpeechOptions {
  /** Defaults to EXPO_PUBLIC_DATA_SOURCE. */
  dataSource?: DataSource;
  /** Mock only: which request's scripted answers to play. */
  requestId?: string;
  /** Force one implementation (tests, the Developer panel). */
  kind?: LiveSpeechKind;
  /** Tests pass a fake module; the app loads expo-speech-recognition lazily. */
  grant?: () => Promise<TranscriptionGrant>;
  capture?: PcmCapture;
  loadNative?: () => SpeechModuleLike | null;
}

/**
 * Demo data gets the simulated recognizer (scripted words, like the prototype). Real data gets the
 * phone's recognizer when this build has it and the phone reports it available; otherwise
 * `unavailable`, and the deck starts in typing mode.
 */
export function createLiveSpeech(opts: CreateLiveSpeechOptions = {}): LiveSpeech {
  const kind = opts.kind ?? ((opts.dataSource ?? config.dataSource) === 'mock' ? 'simulated' : 'native');
  if (kind === 'simulated') {
    return new SimulatedLiveSpeech({
      sentences: (questionIndex, attempt) => scriptedSentences(opts.requestId, questionIndex, attempt),
      isDenied: () => simulationFlags().micDenied,
    });
  }
  if (opts.grant && (kind === 'openai' || kind === 'native')) {
    const fallback = createLiveSpeech({ ...opts, grant: undefined, kind: 'native' });
    const capture = opts.capture ?? (Platform.OS === 'web' ? createBrowserPcmCapture() : unavailablePcmCapture);
    return capture.available ? new ResilientLiveSpeech(new OpenAiLiveSpeech({ grant: opts.grant, capture }), fallback) : fallback;
  }
  if (kind === 'unavailable') return new UnavailableLiveSpeech('chosen');
  const mod = (opts.loadNative ?? loadSpeechModule)();
  if (!mod) return new UnavailableLiveSpeech('no_module');
  let available = false;
  try {
    available = mod.isRecognitionAvailable();
  } catch {
    available = false;
  }
  return available ? new NativeLiveSpeech(mod) : new UnavailableLiveSpeech('not_available');
}

export * from './openai';
export * from './resilient';
