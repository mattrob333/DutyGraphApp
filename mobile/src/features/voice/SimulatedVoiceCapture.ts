import { VoiceError, type VoiceCapture, type VoiceResult } from './types';

export interface SimulatedVoiceOptions {
  /** The words the simulated microphone "hears" for the current question. */
  sampleAnswer: () => string;
  /** Mock "Microphone blocked" toggle. */
  isDenied?: () => boolean;
  /** Words revealed per tick (prototype: 2). */
  wordsPerTick?: number;
  /** Tick length in ms (prototype: 600). */
  tickMs?: number;
}

/**
 * Mock-mode capture. Streams the sample answer word by word so the live
 * transcript, pause and "Done answering" behave like the real thing. No audio
 * is recorded. On stop, if fewer than three words were revealed it returns the
 * whole sample answer, as the prototype does, so a quick demo tap still works.
 */
export class SimulatedVoiceCapture implements VoiceCapture {
  readonly hasLivePartials = true;
  private listeners = new Set<(t: string) => void>();
  private words: string[] = [];
  private shown = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private active = false;

  constructor(private readonly opts: SimulatedVoiceOptions) {}

  async start(): Promise<void> {
    if (this.opts.isDenied?.()) throw new VoiceError('MIC_DENIED', 'Microphone is blocked.');
    this.words = this.opts.sampleAnswer().split(/\s+/).filter(Boolean);
    this.shown = 0;
    this.active = true;
    this.emit();
    this.run();
  }

  pause(): void {
    this.clear();
  }

  resume(): void {
    if (this.active) this.run();
  }

  async stop(): Promise<VoiceResult | null> {
    const words = this.shown > 2 ? this.words.slice(0, this.shown) : this.words;
    this.cancel();
    const text = words.join(' ');
    return text ? { text } : null;
  }

  cancel(): void {
    this.clear();
    this.active = false;
    this.shown = 0;
    this.words = [];
    this.emit();
  }

  onPartial(cb: (text: string) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private run() {
    this.clear();
    const step = this.opts.wordsPerTick ?? 2;
    this.timer = setInterval(() => {
      if (this.shown >= this.words.length) return this.clear();
      this.shown = Math.min(this.words.length, this.shown + step);
      this.emit();
    }, this.opts.tickMs ?? 600);
  }

  private clear() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private emit() {
    const t = this.words.slice(0, this.shown).join(' ');
    this.listeners.forEach((l) => l(t));
  }
}
