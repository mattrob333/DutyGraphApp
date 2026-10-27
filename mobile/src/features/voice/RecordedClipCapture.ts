import type { CompanionRepository } from '@/api/repository';
import { CompanionApiError } from '@/types/domain';
import { VoiceError, type VoiceCapture, type VoiceResult } from './types';

/** The slice of expo-audio's AudioRecorder this class needs (also what tests fake). */
export interface RecorderLike {
  prepareToRecordAsync(): Promise<void>;
  record(): void;
  pause(): void;
  stop(): Promise<void>;
  readonly uri: string | null;
  /** Seconds recorded so far. */
  readonly currentTime: number;
}

export interface AudioSession {
  requestPermission(): Promise<boolean>;
  /** Enables or disables recording mode on the OS audio session. */
  setRecordingMode(on: boolean): Promise<void>;
}

/**
 * http-mode capture. The server has no live streaming yet (501), so one clip is
 * recorded on the phone and uploaded when the participant taps "Done
 * answering"; the transcript that comes back is shown for the participant to
 * check before it is sent as their answer. `hasLivePartials` is false.
 */
export class RecordedClipCapture implements VoiceCapture {
  readonly hasLivePartials = false;
  private recording = false;
  private prepared = false;

  constructor(
    private readonly recorder: RecorderLike,
    private readonly audio: AudioSession,
    private readonly repository: Pick<CompanionRepository, 'transcribeClip'>,
    private readonly sessionId: string,
  ) {}

  async start(): Promise<void> {
    let granted = false;
    try {
      granted = await this.audio.requestPermission();
    } catch (e) {
      throw new VoiceError('MIC_UNAVAILABLE', 'The microphone could not be checked.', e);
    }
    if (!granted) throw new VoiceError('MIC_DENIED', 'Microphone is blocked.');
    try {
      await this.audio.setRecordingMode(true);
      await this.recorder.prepareToRecordAsync();
      this.prepared = true;
      this.recorder.record();
      this.recording = true;
    } catch (e) {
      await this.release();
      throw new VoiceError('MIC_UNAVAILABLE', 'The microphone could not be opened.', e);
    }
  }

  pause(): void {
    if (!this.recording) return;
    try {
      this.recorder.pause();
    } catch {
      // Nothing to release if the recorder is already gone.
    }
    this.recording = false;
  }

  resume(): void {
    if (!this.prepared || this.recording) return;
    try {
      this.recorder.record();
      this.recording = true;
    } catch {
      // Stays paused; the participant can tap Done or type instead.
    }
  }

  async stop(): Promise<VoiceResult | null> {
    if (!this.prepared) return null;
    const durationMs = Math.round((this.recorder.currentTime ?? 0) * 1000);
    try {
      await this.recorder.stop();
    } finally {
      this.recording = false;
      this.prepared = false;
      await this.audio.setRecordingMode(false).catch(() => {});
    }
    const uri = this.recorder.uri;
    if (!uri || durationMs < 300) return null;
    try {
      const { text } = await this.repository.transcribeClip({ sessionId: this.sessionId, uri, mimeType: 'audio/m4a', durationMs });
      return text.trim() ? { text: text.trim() } : null;
    } catch (e) {
      // Network failures keep their identity so the screen can offer the right recovery.
      if (e instanceof CompanionApiError) throw e;
      throw new VoiceError('TRANSCRIPTION_FAILED', "We couldn't transcribe that answer.", e);
    }
  }

  cancel(): void {
    void this.release();
  }

  onPartial(): () => void {
    return () => {};
  }

  private async release() {
    const wasOpen = this.prepared || this.recording;
    this.recording = false;
    this.prepared = false;
    if (wasOpen) {
      try {
        await this.recorder.stop();
      } catch {
        // Already stopped.
      }
    }
    await this.audio.setRecordingMode(false).catch(() => {});
  }
}
