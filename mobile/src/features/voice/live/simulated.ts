import type { LiveSpeech, LiveSpeechHandlers, LiveSpeechStartOptions } from './types';

export interface SimulatedLiveSpeechOptions {
  /** The scripted sentences for one question and attempt (the prototype's `HF_Q[i].utt[attempt]`). */
  sentences: (questionIndex: number, attempt: number) => string[];
  /** Mock "Microphone blocked" toggle. */
  isDenied?: () => boolean;
  /** Words revealed per tick (prototype: 2). */
  wordsPerTick?: number;
  /** Tick length in ms (spec §5: about 180). */
  tickMs?: number;
}

/**
 * Mock-mode live speech, like the prototype: it plays the scripted answer for the card's question
 * and attempt, two words at a time, as growing interim text. No audio is captured. With no script
 * (free talk after Add more, or a card with nothing scripted) it stays silent, so the deck's own
 * silence timers decide what happens next.
 *
 * Each restart of the same question and attempt (Resume after Pause, Try again) carries on from
 * the words already played, as a person would, instead of saying the answer twice.
 */
export class SimulatedLiveSpeech implements LiveSpeech {
  readonly kind = 'simulated' as const;
  private timer: ReturnType<typeof setInterval> | null = null;
  /** Bumped on every start and stop, so a stale tick never reaches new handlers. */
  private run = 0;
  /** Words already played per question and attempt. */
  private readonly played = new Map<string, number>();

  constructor(private readonly opts: SimulatedLiveSpeechOptions) {}

  async start(options: LiveSpeechStartOptions, handlers: LiveSpeechHandlers): Promise<void> {
    this.halt();
    const run = ++this.run;
    if (this.opts.isDenied?.()) {
      handlers.onError({ code: 'permission_denied' });
      return;
    }
    const script = options.script;
    const words = script ? this.opts.sentences(script.questionIndex, script.attempt).join(' ').split(/\s+/).filter(Boolean) : [];
    if (!words.length) return;
    const key = `${script!.questionIndex}:${script!.attempt}`;
    const from = Math.min(words.length, this.played.get(key) ?? 0);
    if (from >= words.length) return;
    const step = this.opts.wordsPerTick ?? 2;
    let shown = from;
    this.timer = setInterval(() => {
      if (run !== this.run) return;
      shown = Math.min(words.length, shown + step);
      this.played.set(key, shown);
      // Text since this start, as a real recognizer reports it.
      handlers.onText(words.slice(from, shown).join(' '));
      if (shown >= words.length) this.halt();
    }, this.opts.tickMs ?? 180);
  }

  async stop(): Promise<void> {
    this.run += 1;
    this.halt();
  }

  private halt() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
