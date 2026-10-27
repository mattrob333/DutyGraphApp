import { expiresAtMs, micError } from "./errors.ts";
import { micSupported, openMic, stopTracks, watchMicRoute } from "./mic.ts";
import {
  appendMessage,
  base64,
  CHUNK_SAMPLES,
  commitMessage,
  languagesFor,
  PcmBatcher,
  pcm16Bytes,
  QuietCommit,
  Resampler,
  rmsLevel,
  sessionUpdateMessage,
  TranscriptAssembler,
} from "./openai-protocol.ts";
import type { LiveTranscriptionGrant, SpeechHandlers, SpeechSource, SpeechSourceError, SpeechStartOptions } from "./types.ts";

/**
 * OpenAI live transcription for the hands-free cards (spec §9.1). The server mints a short-lived
 * key (POST /api/invitations/:token/team/live-transcription); the browser opens the microphone,
 * an AudioWorklet (client/public/handsfree-pcm-worklet.js) posts the samples, and about every
 * 100 ms a base64 PCM16 mono 24 kHz chunk goes over the WebSocket. The deck's pause calls
 * `commit()`. Words come back as delta and completed events (openai-protocol.ts assembles them).
 *
 * The key is kept and reused for the next card until it is about to expire; when a socket with a
 * reused key closes before it opens, the source asks once for a fresh key. Errors always arrive
 * through `handlers.onError`; `start()` itself does not reject. A socket that will not open (or
 * no fresh key) is a `network` error, like a lost socket; the deck hook then moves on to the
 * browser's speech recognition (spec §9.1 order).
 */

/** The `api` helper of client/src/api.ts (prefixes /api, sends the CSRF and idempotency headers). */
export type ApiFn = <T = any>(path: string, method?: string, body?: unknown) => Promise<T>;

export type OpenAISourceOptions = {
  token: string;
  api: ApiFn;
  /** The worklet module; a same-origin file so the production CSP allows it. */
  workletUrl?: string;
  /** How long the socket may take to open, ms. */
  openTimeoutMs?: number;
  /** Quiet after sound with no words back before the source commits on its own (QuietCommit); 0 turns it off. */
  quietCommitMs?: number;
};

type Grant = Extract<LiveTranscriptionGrant, { available: true }>;

export const WORKLET_URL = "/handsfree-pcm-worklet.js";
const WORKLET_NAME = "dutygraph-pcm-capture";
/** A key this close to its expiry is not reused. */
const EXPIRY_MARGIN_MS = 30_000;
/** Audio kept while the socket opens (5 s); older chunks are dropped. */
const MAX_QUEUED = 50;

/** WebSocket, AudioWorklet and getUserMedia: everything the source needs in this browser. */
export const openAISupported = () =>
  typeof window !== "undefined" && typeof WebSocket === "function" && typeof AudioWorkletNode === "function" && micSupported();

/** Asks the server for a key. Any failure or malformed answer is `available: false`. */
export async function requestGrant(token: string, api: ApiFn): Promise<LiveTranscriptionGrant> {
  try {
    const g = await api<LiveTranscriptionGrant>(`/invitations/${encodeURIComponent(token)}/team/live-transcription`, "POST", {});
    if (!g || g.available !== true) return { available: false, reason: (g && "reason" in g && typeof g.reason === "string" && g.reason) || "NOT_AVAILABLE" };
    if (typeof g.clientSecret !== "string" || !g.clientSecret || typeof g.wsUrl !== "string" || !/^wss?:\/\//.test(g.wsUrl) || typeof g.model !== "string") {
      return { available: false, reason: "BAD_GRANT" };
    }
    return g;
  } catch {
    return { available: false, reason: "REQUEST_FAILED" };
  }
}

const usable = (g: Grant | null, now = Date.now()): g is Grant => !!g && (!(g.expiresAt > 0) || expiresAtMs(g.expiresAt) - EXPIRY_MARGIN_MS > now);

/**
 * Fetches a key first, so the caller can fall back when OpenAI is not available here: no key
 * configured, a sample company, the limits, an OpenAI error or a browser without the parts.
 */
export async function createOpenAISource(options: OpenAISourceOptions): Promise<{ source: SpeechSource; reason?: undefined } | { source: null; reason: string }> {
  if (!openAISupported()) return { source: null, reason: "BROWSER_UNSUPPORTED" };
  const grant = await requestGrant(options.token, options.api);
  if (!grant.available) return { source: null, reason: grant.reason };
  return { source: new OpenAISource(options, grant) };
}

/** One microphone session: everything `stop()` releases. */
class Run {
  closed = false;
  open = false;
  ws: WebSocket | null = null;
  stream: MediaStream | null = null;
  ctx: AudioContext | null = null;
  resampler: Resampler | null = null;
  batcher = new PcmBatcher();
  assembler = new TranscriptAssembler();
  quiet: QuietCommit;
  queued: string[] = [];
  /** 24 kHz samples appended since the last commit. */
  sinceCommit = 0;
  /** The last text sent to onText (a completed event often repeats the deltas). */
  text = "";
  /** Stops watching the audio route (watchMicRoute). */
  unwatch: () => void = () => {};
  constructor(
    readonly handlers: SpeechHandlers,
    quietCommitMs: number,
  ) {
    this.quiet = new QuietCommit(quietCommitMs);
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.unwatch();
    this.open = false;
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onopen = ws.onmessage = ws.onerror = null;
      try {
        ws.close(1000);
      } catch {
        /* Already closing. */
      }
    }
    if (this.stream) this.handlers.onStream?.(null);
    stopTracks(this.stream);
    this.stream = null;
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.queued = [];
  }
}

class OpenAISource implements SpeechSource {
  readonly kind = "openai" as const;
  private run: Run | null = null;
  constructor(
    private readonly options: OpenAISourceOptions,
    private grant: Grant | null,
  ) {}

  async start(options: SpeechStartOptions, handlers: SpeechHandlers): Promise<void> {
    // Before any await, so a stop() right after this start() always finds this run and ends it.
    this.run?.close();
    const run = new Run(handlers, this.options.quietCommitMs ?? 700);
    this.run = run;
    let stream: MediaStream;
    try {
      stream = await openMic(options.deviceId);
    } catch (e) {
      return this.fail(run, micError((e as Error)?.name));
    }
    if (run.closed) return stopTracks(stream);
    run.stream = stream;
    run.unwatch = watchMicRoute(stream.getAudioTracks()[0] || null, () => this.fail(run, { code: "device_changed" }));
    handlers.onStream?.(stream);
    try {
      await this.capture(run, stream);
    } catch {
      return this.fail(run, { code: "not_available" });
    }
    if (run.closed) return;
    await this.connect(run, options);
  }

  commit(): void {
    const run = this.run;
    if (run?.open) this.commitRun(run);
  }

  reset(): void {
    const run = this.run;
    if (!run || run.closed) return;
    // Finish the last card's turn, then start the new card's text empty.
    if (run.open) this.commitRun(run);
    run.assembler.reset();
    run.text = "";
  }

  async stop(): Promise<void> {
    const run = this.run;
    this.run = null;
    run?.close();
  }

  /** The audio graph: microphone → worklet (Float32 blocks) → resample → ~100 ms chunks. */
  private async capture(run: Run, stream: MediaStream) {
    const ctx = new AudioContext();
    run.ctx = ctx;
    void ctx.resume().catch(() => {});
    await ctx.audioWorklet.addModule(this.options.workletUrl || WORKLET_URL);
    if (run.closed) return;
    run.resampler = new Resampler(ctx.sampleRate);
    const node = new AudioWorkletNode(ctx, WORKLET_NAME, { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 1, channelCountMode: "explicit" });
    node.port.onmessage = (e: MessageEvent<Float32Array>) => this.frame(run, e.data);
    // The worklet only runs when connected to the output; a silent gain keeps the speakers quiet.
    const mute = ctx.createGain();
    mute.gain.value = 0;
    ctx.createMediaStreamSource(stream).connect(node).connect(mute).connect(ctx.destination);
  }

  private frame(run: Run, samples: Float32Array) {
    if (run.closed || !run.resampler || !(samples instanceof Float32Array)) return;
    for (const chunk of run.batcher.push(run.resampler.push(samples))) {
      const level = rmsLevel(chunk);
      run.handlers.onLevel?.(level);
      this.append(run, chunk);
      if (run.quiet.feed(level, (chunk.length / CHUNK_SAMPLES) * 100) && run.open) this.commitRun(run);
    }
  }

  private append(run: Run, chunk: Float32Array) {
    const message = JSON.stringify(appendMessage(base64(pcm16Bytes(chunk))));
    run.sinceCommit += chunk.length;
    if (run.open && run.ws) return run.ws.send(message);
    run.queued.push(message);
    if (run.queued.length > MAX_QUEUED) run.queued.shift();
  }

  /** Sends the rest of the turn and commits, when at least 100 ms went in since the last commit. */
  private commitRun(run: Run) {
    const rest = run.batcher.take();
    if (rest) this.append(run, rest);
    run.quiet.reset();
    if (run.sinceCommit < CHUNK_SAMPLES || !run.ws) return;
    run.sinceCommit = 0;
    run.ws.send(JSON.stringify(commitMessage()));
  }

  /**
   * Opens the socket with the kept key, or a fresh one. When neither opens (or no fresh key comes)
   * it is a `network` error: the deck moves to the browser's speech recognition, else Try again.
   * `not_available` stays for a missing microphone.
   */
  private async connect(run: Run, options: SpeechStartOptions) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const fresh = !usable(this.grant);
      if (fresh) {
        const g = await requestGrant(this.options.token, this.options.api);
        if (run.closed) return;
        if (!g.available) break;
        this.grant = g;
      }
      const grant = this.grant!;
      if (await this.open(run, grant, options)) return;
      if (run.closed) return;
      this.grant = null;
      if (fresh) break;
    }
    this.fail(run, { code: "network" });
  }

  private open(run: Run, grant: Grant, options: SpeechStartOptions): Promise<boolean> {
    return new Promise((resolve) => {
      let ws: WebSocket;
      try {
        ws = new WebSocket(grant.wsUrl, ["realtime", "openai-insecure-api-key." + grant.clientSecret]);
      } catch {
        return resolve(false);
      }
      run.ws = ws;
      let opened = false;
      const timer = setTimeout(() => {
        if (opened) return;
        ws.onclose = ws.onopen = null;
        if (run.ws === ws) run.ws = null;
        ws.close();
        resolve(false);
      }, this.options.openTimeoutMs ?? 8000);
      ws.onopen = () => {
        clearTimeout(timer);
        opened = true;
        if (run.closed) return resolve(false);
        run.open = true;
        const t = grant.transcription;
        ws.send(JSON.stringify(sessionUpdateMessage({ ...t, model: grant.model, languages: t?.languages?.length ? t.languages : languagesFor(options.lang) })));
        for (const m of run.queued.splice(0)) ws.send(m);
        resolve(true);
      };
      ws.onmessage = (e: MessageEvent) => {
        if (run.closed || typeof e.data !== "string") return;
        const result = run.assembler.handle(e.data);
        if (result.kind === "text") {
          run.quiet.reset();
          if (result.text !== run.text) run.handlers.onText((run.text = result.text));
        } else if (result.kind === "error") {
          // Not fatal: a refused setting or an empty commit leaves the session working. A lost socket is.
          console.warn("Live transcription:", result.message);
        }
      };
      ws.onerror = () => {};
      ws.onclose = () => {
        clearTimeout(timer);
        if (!opened) return resolve(false);
        if (run.ws === ws) this.fail(run, { code: "network" });
      };
    });
  }

  private fail(run: Run, error: SpeechSourceError) {
    if (run.closed) return;
    if (this.run === run) this.run = null;
    run.close();
    run.handlers.onError(error);
  }
}
