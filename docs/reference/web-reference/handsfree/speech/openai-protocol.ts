/**
 * The pure parts of OpenAI live transcription for the web hands-free cards (spec §9.1): the client
 * messages, microphone audio to base64 PCM16 mono 24 kHz, and the transcript assembled from the
 * delta and completed events. No DOM, no WebSocket, so the tests run it in Node.
 */

/** The rate OpenAI expects for `audio/pcm`. */
export const PCM_RATE = 24000;
/** About 100 ms of audio per `input_audio_buffer.append`. OpenAI also refuses a commit of less. */
export const CHUNK_SAMPLES = PCM_RATE / 10;

/* ── Client messages ──────────────────────────────────────────────────────── */

/** The transcription settings the server minted the key with; the browser repeats them once after open. */
export type TranscriptionConfig = {
  model: string;
  languages?: string[];
  keywords?: string[];
  prompt?: string;
  delay?: string;
};

export const appendMessage = (audio: string) => ({ type: "input_audio_buffer.append" as const, audio });
export const commitMessage = () => ({ type: "input_audio_buffer.commit" as const });

/** The one session.update sent after the socket opens: the same transcription session as the key. */
export function sessionUpdateMessage(config: TranscriptionConfig) {
  const transcription: TranscriptionConfig = { model: config.model, languages: config.languages?.length ? config.languages : ["en"] };
  if (config.keywords?.length) transcription.keywords = config.keywords;
  if (config.prompt) transcription.prompt = config.prompt;
  if (config.delay) transcription.delay = config.delay;
  return {
    type: "session.update" as const,
    session: {
      type: "transcription" as const,
      audio: {
        input: {
          format: { type: "audio/pcm" as const, rate: PCM_RATE },
          transcription,
          turn_detection: null,
          noise_reduction: { type: "near_field" as const },
        },
      },
    },
  };
}

/** "en-US" → ["en"]; the language list OpenAI takes is ISO-639-1. */
export const languagesFor = (lang: string | undefined) => [((lang || "en").split(/[-_]/)[0] || "en").toLowerCase()];

/* ── Audio ────────────────────────────────────────────────────────────────── */

/** Float samples (-1..1) to little-endian PCM16 bytes. */
export function pcm16Bytes(samples: ArrayLike<number>): Uint8Array {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] || 0));
    view.setInt16(i * 2, s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff), true);
  }
  return bytes;
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Standard base64 with padding, without btoa or Buffer. */
export function base64(bytes: Uint8Array): string {
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64[n >> 18] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  if (i < bytes.length) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8);
    out += B64[n >> 18] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : "=") + "=";
  }
  return out;
}

/**
 * Streaming resampler to 24 kHz from any input rate, across chunks without clicks. Downsampling
 * averages the input samples under each output sample (a box filter, enough against aliasing for
 * speech); upsampling interpolates linearly.
 */
export class Resampler {
  readonly ratio: number;
  private buf = new Float32Array(0);
  private pos = 0;
  constructor(inputRate: number, outputRate = PCM_RATE) {
    if (!(inputRate > 0) || !(outputRate > 0)) throw new RangeError("sample rates must be positive");
    this.ratio = inputRate / outputRate;
  }
  push(input: Float32Array): Float32Array {
    if (this.ratio === 1) return input.slice();
    const data = new Float32Array(this.buf.length + input.length);
    data.set(this.buf);
    data.set(input, this.buf.length);
    const out: number[] = [];
    if (this.ratio > 1) {
      while (this.pos + this.ratio <= data.length) {
        const a = Math.ceil(this.pos);
        const b = Math.ceil(this.pos + this.ratio);
        let sum = 0;
        for (let i = a; i < b; i++) sum += data[i];
        out.push(b > a ? sum / (b - a) : data[Math.floor(this.pos)]);
        this.pos += this.ratio;
      }
    } else {
      while (Math.floor(this.pos) + 1 < data.length) {
        const i = Math.floor(this.pos);
        out.push(data[i] + (data[i + 1] - data[i]) * (this.pos - i));
        this.pos += this.ratio;
      }
    }
    const drop = Math.min(Math.floor(this.pos), data.length);
    this.buf = data.slice(drop);
    this.pos -= drop;
    return Float32Array.from(out);
  }
}

export const resample = (input: Float32Array, inputRate: number, outputRate = PCM_RATE) => new Resampler(inputRate, outputRate).push(input);

/** Level 0..1 from float samples; the same gain as live-voice-model's levelFromSamples. */
export function rmsLevel(samples: ArrayLike<number>, gain = 5): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.min(1, Math.sqrt(sum / samples.length) * gain);
}

/**
 * Collects 24 kHz samples and hands out about 100 ms at a time. `take()` returns the rest (for the
 * commit, so the end of the turn goes with it).
 */
export class PcmBatcher {
  private parts: Float32Array[] = [];
  private size = 0;
  constructor(readonly chunk = CHUNK_SAMPLES) {}
  /** Adds samples; returns every full chunk now ready. */
  push(samples: Float32Array): Float32Array[] {
    if (samples.length) {
      this.parts.push(samples);
      this.size += samples.length;
    }
    const ready: Float32Array[] = [];
    while (this.size >= this.chunk) ready.push(this.read(this.chunk));
    return ready;
  }
  take(): Float32Array | null {
    return this.size ? this.read(this.size) : null;
  }
  get pending() {
    return this.size;
  }
  private read(n: number): Float32Array {
    const out = new Float32Array(n);
    let at = 0;
    while (at < n) {
      const head = this.parts[0];
      const use = Math.min(head.length, n - at);
      out.set(head.subarray(0, use), at);
      at += use;
      if (use === head.length) this.parts.shift();
      else this.parts[0] = head.subarray(use);
    }
    this.size -= n;
    return out;
  }
}

/**
 * A fallback commit for when no words come back while the person talks (it is unverified whether
 * the live model streams words before a commit, spec §9.1). After `minSpeechMs` of sound with no
 * new words and then `quietMs` of quiet, `feed` returns true once: commit, so the words come back.
 * When words stream live, every delta resets the watch and it never fires.
 */
export class QuietCommit {
  private speech = 0;
  private quiet = 0;
  constructor(
    readonly quietMs = 700,
    readonly minSpeechMs = 300,
    readonly quietLevel = 0.04,
  ) {}
  feed(level: number, ms: number): boolean {
    if (!(this.quietMs > 0)) return false;
    if (level >= this.quietLevel) {
      this.speech += ms;
      this.quiet = 0;
      return false;
    }
    if (this.speech < this.minSpeechMs) return false;
    this.quiet += ms;
    if (this.quiet < this.quietMs) return false;
    this.reset();
    return true;
  }
  /** Words arrived (or a commit was sent): the sound so far is being transcribed. */
  reset() {
    this.speech = 0;
    this.quiet = 0;
  }
}

/* ── Server events ────────────────────────────────────────────────────────── */

export type ServerEventResult = { kind: "text"; text: string } | { kind: "error"; message: string; code?: string } | { kind: "ignored" };

type Item = { text: string; done: boolean };

/**
 * Merges `conversation.item.input_audio_transcription.delta` and `.completed` by `item_id` into the
 * full text heard since the socket opened. Items keep the order they first appeared in (a commit's
 * `input_audio_buffer.committed`, when the server sends it, fixes the order first). A completed
 * event replaces that item's delta words, whatever order completions arrive in; later deltas for a
 * completed item are ignored. Unknown events are ignored; `error` events are returned.
 */
export class TranscriptAssembler {
  private order: string[] = [];
  private items = new Map<string, Item>();
  /** Items of earlier cards (`reset`): their late words never reach the new card. */
  private stale = new Set<string>();
  /** Until then, a newly committed item is the forced commit of the card that just ended. */
  private staleUntil = 0;
  /** A new card: the text starts empty; words of items heard before stay with the old card. */
  reset(now = Date.now(), graceMs = 1500) {
    for (const id of this.order) this.stale.add(id);
    this.order = [];
    this.items.clear();
    this.staleUntil = now + graceMs;
  }
  private item(id: string): Item {
    let it = this.items.get(id);
    if (!it) {
      it = { text: "", done: false };
      this.items.set(id, it);
      this.order.push(id);
    }
    return it;
  }
  /** Takes a parsed server event (or its JSON text). */
  handle(raw: unknown): ServerEventResult {
    let e: any = raw;
    if (typeof raw === "string") {
      try {
        e = JSON.parse(raw);
      } catch {
        return { kind: "ignored" };
      }
    }
    if (!e || typeof e !== "object" || typeof e.type !== "string") return { kind: "ignored" };
    if (e.type === "error") {
      const err = e.error && typeof e.error === "object" ? e.error : {};
      return { kind: "error", message: typeof err.message === "string" ? err.message : "error", ...(typeof err.code === "string" ? { code: err.code } : {}) };
    }
    const id = typeof e.item_id === "string" && e.item_id ? e.item_id : null;
    if (!id) return { kind: "ignored" };
    if (this.stale.has(id)) return { kind: "ignored" };
    if (e.type === "input_audio_buffer.committed" && !this.items.has(id) && Date.now() < this.staleUntil) {
      this.stale.add(id);
      return { kind: "ignored" };
    }
    if (e.type === "input_audio_buffer.committed") {
      this.item(id);
      return { kind: "ignored" };
    }
    if (e.type === "conversation.item.input_audio_transcription.delta") {
      if (typeof e.delta !== "string" || !e.delta) return { kind: "ignored" };
      const it = this.item(id);
      if (it.done) return { kind: "ignored" };
      it.text += e.delta;
      return { kind: "text", text: this.text() };
    }
    if (e.type === "conversation.item.input_audio_transcription.completed") {
      const it = this.item(id);
      const transcript = typeof e.transcript === "string" ? e.transcript : it.text;
      if (it.done && it.text === transcript) return { kind: "ignored" };
      it.text = transcript;
      it.done = true;
      return { kind: "text", text: this.text() };
    }
    return { kind: "ignored" };
  }
  /** The words so far, items in order, single-spaced. */
  text(): string {
    return this.order
      .map((id) => this.items.get(id)!.text.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join(" ");
  }
}
