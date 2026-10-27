/**
 * Live speech for the hands-free cards: words appear while the person talks, on the device.
 * Implementations:
 * - `native`: the phone's speech recognizer (iOS Speech, Android SpeechRecognizer) with
 *   interim results. Needs a development or store build, not Expo Go.
 * - `simulated`: scripted words for demo data (mock data source), like the prototype.
 * - `unavailable`: no recognizer on this device; the deck starts in typing mode.
 *
 * The deck (src/features/handsfree) owns the timing: it treats "no new words for N ms" as a
 * pause. A recognizer that reports its own end of speech may also call `onPause`.
 */
export type LiveSpeechKind = 'native' | 'openai' | 'simulated' | 'unavailable';

export type LiveSpeechError =
  | { code: 'permission_denied' }
  | { code: 'not_available' }
  | { code: 'network' }
  | { code: 'other'; message?: string };

export type LiveSpeechHandlers = {
  /** The full text heard since `start`, interim words included. Replaces the previous value. */
  onText: (text: string) => void;
  /** Optional: the recognizer itself detected the end of an utterance. */
  onPause?: () => void;
  onLevel?: (level: number) => void;
  onError: (error: LiveSpeechError) => void;
};

export type LiveSpeechStartOptions = {
  /** BCP-47, e.g. "en-US". */
  lang: string;
  /** Simulated only: which scripted answer to play (question index and attempt). */
  script?: { questionIndex: number; attempt: number };
};

export interface LiveSpeech {
  readonly kind: LiveSpeechKind;
  readonly source?: 'voice_device' | 'voice_openai' | 'voice_browser';
  reset?(options?: LiveSpeechStartOptions): Promise<void> | void;
  commit?(): void;
  /** Starts listening. Resolves once the microphone is open. */
  start(options: LiveSpeechStartOptions, handlers: LiveSpeechHandlers): Promise<void>;
  /** Stops and releases the microphone. Safe to call twice. */
  stop(): Promise<void>;
}
