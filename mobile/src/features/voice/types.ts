/**
 * Client voice abstraction (PRD 12, 13).
 *
 * The conversation screen talks to a `VoiceCapture` and never to a recorder
 * or the transcription API directly. Two implementations exist:
 *
 * - `SimulatedVoiceCapture` (mock data source): streams the words of a scripted
 *   sample answer as a partial transcript. No audio is captured.
 * - `RecordedClipCapture` (http data source): records one clip with
 *   expo-audio and uploads it for server-side transcription when the
 *   participant taps "Done answering". No live partials.
 *
 * Rules every implementation follows:
 * - the microphone opens only from `start()`, which the screen calls after an
 *   explicit participant action; it never opens on its own;
 * - `pause()`, `stop()` and `cancel()` release the microphone immediately;
 * - a blocked microphone rejects `start()` with `VoiceError('MIC_DENIED')`.
 */

export type VoiceErrorCode = 'MIC_DENIED' | 'MIC_UNAVAILABLE' | 'TRANSCRIPTION_FAILED';

export class VoiceError extends Error {
  constructor(
    public readonly code: VoiceErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'VoiceError';
  }
}

export interface VoiceResult {
  text: string;
}

export interface VoiceCapture {
  /** True when `onPartial` delivers words while the participant speaks. */
  readonly hasLivePartials: boolean;
  /** Opens the microphone. Rejects with VoiceError('MIC_DENIED') when blocked. */
  start(): Promise<void>;
  /** Stops capturing but keeps what was heard so far. */
  pause(): void;
  resume(): void;
  /**
   * Ends the answer and returns the transcript, or null if nothing was heard.
   * May take a moment (upload + transcription) for clip-based capture.
   */
  stop(): Promise<VoiceResult | null>;
  /** Releases the microphone and discards everything. Safe to call repeatedly. */
  cancel(): void;
  /** Live transcript updates. Returns an unsubscribe function. */
  onPartial(cb: (text: string) => void): () => void;
}
