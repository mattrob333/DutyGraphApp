import type { VoiceOut } from "../out";
export type FacilitatorTrigger =
  | "opening"
  | "timebox_end"
  | "silence"
  | "leader_next"
  | "slot_empty"
  | "closing";
export type FacilitatorLine = { id: string; text: string };
export interface FacilitatorVoice {
  readonly kind: "tts_lines" | "realtime" | "simulated";
  prepare(sessionId: string): Promise<void>;
  speak(line: FacilitatorLine): Promise<void>;
  stop(): void;
  setMuted(muted: boolean): void;
  dispose(): Promise<void>;
}
export class TtsFacilitatorVoice implements FacilitatorVoice {
  readonly kind = "tts_lines" as const;
  private muted = false;
  constructor(private out: VoiceOut) {}
  async prepare(_sessionId: string) {}
  async speak(line: FacilitatorLine) {
    if (!this.muted) await this.out.speak(line.text, { id: line.id });
  }
  stop() {
    this.out.stop();
  }
  setMuted(muted: boolean) {
    this.muted = muted;
    if (muted) this.stop();
  }
  dispose() {
    return this.out.dispose();
  }
}
/** Clock-driven turn taking: no timer can create a turn outside one of six explicit triggers. */
export class MeetingTurnController {
  private pending: { line: FacilitatorLine; queuedAt: number } | null = null;
  private speaking: FacilitatorLine | null = null;
  private lastSpeech = 0;
  private muted = false;
  private stopped = false;
  constructor(
    private voice: FacilitatorVoice,
    private showLine: (line: FacilitatorLine) => void,
    private now = Date.now,
  ) {
    this.lastSpeech = now();
  }
  queue(trigger: FacilitatorTrigger, line: FacilitatorLine) {
    if (
      ![
        "opening",
        "timebox_end",
        "silence",
        "leader_next",
        "slot_empty",
        "closing",
      ].includes(trigger) ||
      this.stopped
    )
      return;
    this.pending = { line, queuedAt: this.now() };
  }
  speechDetected() {
    this.lastSpeech = this.now();
    if (this.speaking) {
      const line = this.speaking;
      this.speaking = null;
      this.voice.stop();
      this.showLine(line);
    }
  }
  async tick() {
    if (!this.pending || this.stopped || this.speaking) return;
    if (this.muted) {
      if (this.now() - this.pending.queuedAt >= 8000) {
        this.showLine(this.pending.line);
        this.pending = null;
      }
      return;
    }
    const now = this.now();
    if (now - this.lastSpeech < 1200) {
      if (now - this.pending.queuedAt >= 8000) {
        this.showLine(this.pending.line);
        this.pending = null;
      }
      return;
    }
    const line = this.pending.line;
    this.pending = null;
    this.speaking = line;
    try {
      await this.voice.speak(line);
    } catch {
      this.showLine(line);
    } finally {
      if (this.speaking === line) this.speaking = null;
    }
  }
  sayNow(line: FacilitatorLine) {
    if (!this.stopped && !this.muted) {
      this.queue("leader_next", line);
      return this.tick();
    }
    return Promise.resolve();
  }
  mute(muted: boolean) {
    this.muted = muted;
    this.voice.setMuted(muted);
    if (muted && this.speaking) {
      this.showLine(this.speaking);
      this.speaking = null;
    }
  }
  skip() {
    this.pending = null;
    this.speaking = null;
    this.voice.stop();
  }
  stop() {
    this.stopped = true;
    this.skip();
  }
}
