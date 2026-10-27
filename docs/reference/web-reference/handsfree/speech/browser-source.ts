import { type Recognition, recognitionCtor, startOn } from "../../sponsor/speech-recognition.ts";
import { micError, recognitionError } from "./errors.ts";
import { micSupported, openMic, startMeter, stopTracks, watchMicRoute } from "./mic.ts";
import type { SpeechHandlers, SpeechSource, SpeechSourceError, SpeechStartOptions } from "./types.ts";

/**
 * The browser's own speech recognition for the hands-free cards (spec §9.1, the second source),
 * with LiveVoice's recognition handling: continuous with interim words, the chosen microphone's
 * track where the browser takes one (Chrome 135+), and a restart on the recognizer's own `end`
 * while listening. The level bars come from the chosen microphone, as in LiveVoice. Errors arrive
 * through `handlers.onError`; `start()` does not reject.
 */

export const browserSpeechSupported = () => !!recognitionCtor();

/** Null where the browser has no speech recognition. */
export function createBrowserSource(): SpeechSource | null {
  return browserSpeechSupported() ? new BrowserSource() : null;
}

type Run = {
  closed: boolean;
  rec: Recognition | null;
  stream: MediaStream | null;
  stopMeter: () => void;
  /** Stops watching the audio route (watchMicRoute). */
  unwatch: () => void;
  /** Finished phrases since `start` (or the last `reset`), across recognizer restarts. */
  finals: string[];
  /** Results of the current recognizer session that belong to an earlier card (`reset`). */
  offset: number;
  /** How many results the current recognizer session has given. */
  seen: number;
  handlers: SpeechHandlers;
  /** The recognizer gave words at least once in this run (so a later error is a drop, not a broken browser). */
  heard: boolean;
  /** Live words stopped while the microphone runs (no signal); retrying with `retryMs`. */
  trouble: boolean;
  retryMs: number;
  retry: ReturnType<typeof setTimeout> | null;
  /** Stops listening for the `online` event. */
  unonline: () => void;
};

/** Retrying the recognizer after a drop: first after this long, doubling up to RETRY_MAX_MS (and at once when back online). */
export const RETRY_MS = 2000;
export const RETRY_MAX_MS = 15000;

/**
 * Whether a recognizer error is a drop to ride out with the microphone running (October 19, Jesse on
 * a drive): `network` once the browser is offline or after words came, and a refusal to restart after
 * words came (phones refuse a restart that no tap started). A `network` error before any words while
 * online stays a browser without live words (Brave), as LiveVoice treats it.
 */
export function isDrop(code: string, heard: boolean, online: boolean): boolean {
  if (code === "network") return heard || !online;
  return heard && (code === "not-allowed" || code === "service-not-allowed" || code === "audio-capture");
}

class BrowserSource implements SpeechSource {
  readonly kind = "browser" as const;
  private run: Run | null = null;

  async start(options: SpeechStartOptions, handlers: SpeechHandlers): Promise<void> {
    // Before any await, so a stop() right after this start() always finds this run and ends it.
    if (this.run) this.release(this.run);
    const run: Run = {
      closed: false,
      rec: null,
      stream: null,
      stopMeter: () => {},
      unwatch: () => {},
      finals: [],
      offset: 0,
      seen: 0,
      handlers,
      heard: false,
      trouble: false,
      retryMs: RETRY_MS,
      retry: null,
      unonline: () => {},
    };
    this.run = run;
    const fail = (error: SpeechSourceError) => {
      if (run.closed) return;
      this.release(run);
      handlers.onError(error);
    };
    const C = recognitionCtor();
    if (!C) return fail({ code: "not_available" });
    let track: MediaStreamTrack | null = null;
    if (micSupported()) {
      try {
        const stream = await openMic(options.deviceId);
        if (run.closed) return stopTracks(stream);
        run.stream = stream;
        track = stream.getAudioTracks()[0] || null;
        run.unwatch = watchMicRoute(track, () => fail({ code: "device_changed" }));
        handlers.onStream?.(stream);
        if (handlers.onLevel) run.stopMeter = startMeter(stream, (l) => !run.closed && handlers.onLevel?.(l));
      } catch (e) {
        return fail(micError((e as Error)?.name));
      }
    }
    const r = new C();
    r.continuous = true;
    r.interimResults = true;
    r.lang = options.lang || (typeof navigator !== "undefined" && navigator.language) || "en-US";
    r.onresult = (e) => {
      if (run.rec !== r) return;
      run.heard = true;
      if (run.trouble) {
        run.trouble = false;
        run.retryMs = RETRY_MS;
        handlers.onTrouble?.(false);
      }
      let live = "";
      run.seen = e.results.length;
      for (let i = Math.max(e.resultIndex, run.offset); i < e.results.length; i++) {
        const res = e.results[i];
        const text = res[0]?.transcript ?? "";
        if (res.isFinal) {
          if (text.trim()) run.finals.push(text.trim());
        } else live += text;
      }
      handlers.onText([...run.finals, live.trim()].filter(Boolean).join(" "));
    };
    r.onerror = (e) => {
      if (run.rec !== r) return;
      const online = typeof navigator === "undefined" || navigator.onLine !== false;
      if (handlers.onTrouble && isDrop(e.error, run.heard, online)) {
        // The recognizer ends after this; `onend` tries again later while the microphone keeps running.
        if (!run.trouble) {
          run.trouble = true;
          handlers.onTrouble(true);
        }
        return;
      }
      const error = recognitionError(e.error);
      if (error) fail(error);
    };
    // Browsers end a session after a silence; keep listening until the deck stops it.
    r.onend = () => {
      if (run.rec !== r || run.closed) return;
      // A new recognizer session numbers its results from 0 again.
      run.offset = 0;
      run.seen = 0;
      // Earlier phrases are kept in `finals`; the new session's results continue after them.
      if (run.trouble) return this.retryLater(run, r);
      try {
        startOn(r, run.stream?.getAudioTracks()[0] || null);
      } catch {
        if (!handlers.onTrouble || !run.heard) return fail({ code: "other", message: "restart failed" });
        run.trouble = true;
        handlers.onTrouble(true);
        this.retryLater(run, r);
      }
    };
    if (handlers.onTrouble && typeof window !== "undefined" && typeof window.addEventListener === "function") {
      const back = () => {
        if (!run.trouble || run.closed || run.rec !== r || !run.retry) return;
        clearTimeout(run.retry);
        run.retry = null;
        run.retryMs = RETRY_MS;
        this.restart(run, r);
      };
      window.addEventListener("online", back);
      run.unonline = () => window.removeEventListener("online", back);
    }
    run.rec = r;
    try {
      startOn(r, track);
    } catch {
      fail({ code: "not_available" });
    }
  }

  commit(): void {}

  /** After a drop: start the recognizer again later, backing off; the microphone keeps running. */
  private retryLater(run: Run, r: Recognition) {
    if (run.retry || run.closed) return;
    const ms = run.retryMs;
    run.retryMs = Math.min(RETRY_MAX_MS, ms * 2);
    run.retry = setTimeout(() => {
      run.retry = null;
      this.restart(run, r);
    }, ms);
  }

  private restart(run: Run, r: Recognition) {
    if (run.closed || run.rec !== r) return;
    try {
      startOn(r, run.stream?.getAudioTracks()[0] || null);
    } catch {
      // Still refused or still running: try again later.
      this.retryLater(run, r);
    }
  }

  reset(): void {
    const run = this.run;
    if (!run || run.closed) return;
    run.finals = [];
    run.offset = run.seen;
  }

  async stop(): Promise<void> {
    if (this.run) this.release(this.run);
  }

  private release(run: Run) {
    if (this.run === run) this.run = null;
    if (run.closed) return;
    run.closed = true;
    const r = run.rec;
    run.rec = null;
    if (r) {
      r.onresult = r.onerror = null;
      r.onend = null;
      try {
        r.abort();
      } catch {
        /* Already stopped. */
      }
    }
    if (run.retry) clearTimeout(run.retry);
    run.retry = null;
    run.unonline();
    run.unwatch();
    run.stopMeter();
    if (run.stream) run.handlers.onStream?.(null);
    stopTracks(run.stream);
    run.stream = null;
  }
}
