/**
 * The recorded backup for the hands-free cards (October 19; docs/specs/COMPANION-HANDS-FREE.md §9).
 *
 * Live words come from a recognizer that needs a connection and that phones stop now and then. So
 * while a spoken card listens, the page also records it on the same microphone stream (a "part").
 * A part whose live words were fine is thrown away when it ends. A part with trouble (no signal on
 * a drive, a recognizer that went deaf, the earbuds switching) is kept on this device (IndexedDB, so
 * a reload keeps it), sent to the link's /team/transcribe once there is a connection (the company's
 * OpenAI key; this device's Whisper when the server cannot), and its text goes into that card's
 * answer (shared/hands-free/recorded.ts). The review waits for these before Send.
 *
 * A recording is deleted once its text is in the answer, when the answers are sent or started again,
 * and after KEEP_DAYS if it was never sent.
 *
 * Limits: one upload must stay under the hosted body limit (about 4.5 MB) and the 10 minutes this
 * device can transcribe, so a part ends at PART_MAX_BYTES or PART_MAX_MS and the next one starts.
 * One team ask can turn 15 recordings into text a day (server/team-link.ts); the server says how
 * many are left after each one.
 */
import fixWebmDuration from "fix-webm-duration";
import type { HandsFreeVoiceVia, QuestionKey } from "../../../shared/hands-free/types.ts";
import { transcribeClip } from "../server-transcription.ts";

/** Under the hosted request body limit (about 4.5 MB). */
export const PART_MAX_BYTES = 4 * 1024 * 1024;
/** Under the 10 minutes this device's Whisper accepts. */
export const PART_MAX_MS = 9.5 * 60 * 1000;
/** From here the card says the recording is about to start a new part. */
export const PART_WARN_MS = 8 * 60 * 1000;
/** Retrying an upload that found no connection. */
export const UPLOAD_RETRY_MS = 10_000;
/** After this many failed tries (not counting no connection) a recording waits for the person. */
export const MAX_UPLOAD_TRIES = 2;
/** A recording never sent is deleted from this device after a week. */
export const KEEP_DAYS = 7;

const TYPES = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"];

/** A format this browser records that the transcribe route takes (iPhone Safari: audio/mp4), or "". */
export function recordingType(): string {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return "";
  return TYPES.find((t) => MediaRecorder.isTypeSupported(t)) || "";
}

/**
 * One part: a MediaRecorder on the live microphone stream, 32 kbps mono (as the interview app),
 * pausable, that calls `onFull` once at the size or time limit.
 */
export class PartRecorder {
  private rec: MediaRecorder;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private before = 0;
  private full = false;
  bytes = 0;
  private stopped: Promise<Blob | null> | null = null;

  constructor(
    stream: MediaStream,
    type: string,
    private readonly onFull: () => void,
  ) {
    this.rec = new MediaRecorder(stream, { mimeType: type, audioBitsPerSecond: 32000 });
    this.rec.ondataavailable = (e) => {
      if (!e.data?.size) return;
      this.chunks.push(e.data);
      this.bytes += e.data.size;
      this.checkFull();
    };
    this.rec.start(1000);
    this.startedAt = Date.now();
  }

  /** Recorded time, without pauses. */
  get ms(): number {
    return this.before + (this.rec.state === "recording" ? Date.now() - this.startedAt : 0);
  }

  get paused(): boolean {
    return this.rec.state === "paused";
  }

  private checkFull() {
    if (this.full || (this.bytes < PART_MAX_BYTES - 64 * 1024 && this.ms < PART_MAX_MS)) return;
    this.full = true;
    this.onFull();
  }

  /** Typing or between cards: nothing is recorded meanwhile. */
  pause() {
    if (this.rec.state !== "recording") return;
    this.before += Date.now() - this.startedAt;
    try {
      this.rec.pause();
    } catch {
      /* Not supported: keeps recording. */
    }
  }

  resume() {
    if (this.rec.state !== "paused") return;
    this.startedAt = Date.now();
    try {
      this.rec.resume();
    } catch {
      /* Already recording. */
    }
  }

  /** Called about once a second by the hook, so the time limit applies while no data arrives. */
  tick() {
    this.checkFull();
  }

  /** Ends the part: the recording (null when empty or the recorder failed). */
  stop(): Promise<Blob | null> {
    if (this.stopped) return this.stopped;
    const ms = this.ms;
    this.stopped = new Promise<Blob | null>((resolve) => {
      const finish = async () => {
        const raw = this.chunks.length ? new Blob(this.chunks, { type: this.rec.mimeType || this.chunks[0].type }) : null;
        if (!raw?.size) return resolve(null);
        // Chromium's WebM has no duration; repair it as the interview app does. MP4 keeps its own.
        if (raw.type.includes("webm")) {
          try {
            return resolve(await fixWebmDuration(raw, ms, { logger: false }));
          } catch {
            /* Keep the original. */
          }
        }
        resolve(raw);
      };
      if (this.rec.state === "inactive") return void finish();
      this.rec.onstop = () => void finish();
      try {
        this.rec.stop();
      } catch {
        void finish();
      }
    });
    return this.stopped;
  }
}

/* ------------------------------------------------------------------ queue */

export type BackupClip = {
  id: string;
  /** The team ask (request id): clips of one link only. */
  requestId: string;
  /** The card (index in the deck's questions). */
  idx: number;
  key: QuestionKey;
  /** The live words heard while it recorded, to replace with its text. */
  replace: string;
  /** The card's words when it started: its text goes after them when `replace` is not there. */
  before?: string;
  blob: Blob;
  ms: number;
  createdAt: number;
  tries: number;
  /** waiting: to send (or no connection yet); sending; failed: shown with Try again. */
  state: "waiting" | "sending" | "failed";
  error?: string;
};

export type BackupResult = { id: string; idx: number; key: QuestionKey; replace: string; before?: string; text: string; via: HandsFreeVoiceVia };

export type BackupView = {
  clips: BackupClip[];
  results: BackupResult[];
  /** Recordings this ask can still turn into text today, when the server said. */
  remaining: number | null;
  online: boolean;
};

/** A short line for the review and the card while recordings wait ("2 recorded answers waiting…"). */
export function backupLine(v: Pick<BackupView, "clips" | "online">): string {
  const open = v.clips.filter((c) => c.state !== "failed").length;
  if (!open) return "";
  const what = open === 1 ? "1 recorded answer" : `${open} recorded answers`;
  return v.online ? `Writing down ${what}…` : `${what} saved on this phone. We'll write ${open === 1 ? "it" : "them"} down when you're back online.`;
}

/** "1:05": minutes and seconds of a part. */
export const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const DB = "dutygraph-handsfree";
const STORE = "clips";

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

type Stored = Omit<BackupClip, "blob" | "state"> & { data: ArrayBuffer; type: string; failed?: boolean };

/**
 * Kept clips of one ask, on this device. Every call is best effort: a private window or full storage
 * leaves the queue in memory only (it still works until the page closes).
 */
const store = {
  async put(c: BackupClip) {
    const db = await openDb();
    if (!db) return;
    try {
      const data = await c.blob.arrayBuffer();
      const row: Stored = { ...c, data, type: c.blob.type, failed: c.state === "failed" };
      delete (row as Partial<BackupClip>).blob;
      delete (row as Partial<BackupClip>).state;
      db.transaction(STORE, "readwrite").objectStore(STORE).put(row);
    } catch {
      /* Memory only. */
    }
  },
  async remove(id: string) {
    const db = await openDb();
    try {
      db?.transaction(STORE, "readwrite").objectStore(STORE).delete(id);
    } catch {
      /* Gone already. */
    }
  },
  async list(requestId: string): Promise<BackupClip[]> {
    const db = await openDb();
    if (!db) return [];
    return new Promise((resolve) => {
      try {
        const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
        const oldest = Date.now() - KEEP_DAYS * 86_400_000;
        req.onsuccess = () =>
          resolve(
            (req.result as Stored[])
              .filter((r) => {
                if (r.createdAt >= oldest) return true;
                void store.remove(r.id);
                return false;
              })
              .filter((r) => r.requestId === requestId)
              .map(({ data, type, failed, ...r }) => ({ ...r, blob: new Blob([data], { type }), state: failed ? "failed" : "waiting" }) as BackupClip)
              .sort((a, b) => a.createdAt - b.createdAt),
          );
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  },
};

const isOnline = () => typeof navigator === "undefined" || navigator.onLine !== false;
const hasWindow = () => typeof window !== "undefined" && typeof window.addEventListener === "function";

/**
 * The recordings of one ask waiting to become text, and the texts not yet put into answers. One
 * upload at a time, oldest first; no connection waits (and tries again when the browser is back
 * online or every UPLOAD_RETRY_MS); other failures are shown with Try again after MAX_UPLOAD_TRIES.
 */
export class BackupQueue {
  private clips: BackupClip[] = [];
  private results: BackupResult[] = [];
  private remaining: number | null = null;
  private listeners = new Set<() => void>();
  private busy = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private view: BackupView;
  private closed = false;
  private abort = new AbortController();

  constructor(
    readonly requestId: string,
    /** The link's transcribe route, when the company's OpenAI key is there; else this device transcribes. */
    private readonly endpoint: string | undefined,
    private readonly transcribe: typeof transcribeClip = transcribeClip,
  ) {
    this.view = this.makeView();
    if (hasWindow()) {
      window.addEventListener("online", this.wake);
      window.addEventListener("offline", this.notify);
    }
    void store.list(requestId).then((kept) => {
      if (this.closed || !kept.length) return;
      const known = new Set(this.clips.map((c) => c.id));
      this.clips = [...kept.filter((c) => !known.has(c.id)), ...this.clips];
      this.notify();
      this.kick();
    });
  }

  private makeView(): BackupView {
    return { clips: [...this.clips], results: [...this.results], remaining: this.remaining, online: isOnline() };
  }

  private notify = () => {
    this.view = this.makeView();
    for (const fn of this.listeners) fn();
  };

  private wake = () => {
    this.notify();
    this.kick();
  };

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getView = () => this.view;

  /** A part with trouble ended: keep it and send it when possible. */
  add(c: Omit<BackupClip, "id" | "createdAt" | "tries" | "state" | "requestId">) {
    const clip: BackupClip = { ...c, id: crypto.randomUUID(), requestId: this.requestId, createdAt: Date.now(), tries: 0, state: "waiting" };
    this.clips.push(clip);
    void store.put(clip);
    this.notify();
    this.kick();
  }

  /** The text was put into its answer. */
  consume(id: string) {
    const before = this.results.length;
    this.results = this.results.filter((r) => r.id !== id);
    if (this.results.length !== before) this.notify();
  }

  retry(id: string) {
    const c = this.clips.find((x) => x.id === id);
    if (!c || c.state !== "failed") return;
    c.state = "waiting";
    c.tries = 0;
    c.error = undefined;
    this.notify();
    this.kick();
  }

  /** The person keeps the answer as it is: the recording is deleted. */
  drop(id: string) {
    this.clips = this.clips.filter((c) => c.id !== id);
    void store.remove(id);
    this.notify();
  }

  /** The answers were sent (or started again): nothing more to do for this ask on this device. */
  clear() {
    for (const c of this.clips) void store.remove(c.id);
    this.clips = [];
    this.results = [];
    this.notify();
  }

  close() {
    this.closed = true;
    this.abort.abort();
    if (this.timer) clearTimeout(this.timer);
    if (hasWindow()) {
      window.removeEventListener("online", this.wake);
      window.removeEventListener("offline", this.notify);
    }
    this.listeners.clear();
  }

  private later() {
    if (this.timer || this.closed) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.kick();
    }, UPLOAD_RETRY_MS);
  }

  kick() {
    if (this.busy || this.closed) return;
    const next = this.clips.find((c) => c.state === "waiting");
    if (!next) return;
    if (!isOnline()) return this.later();
    this.busy = true;
    next.state = "sending";
    this.notify();
    this.transcribe(next.blob, { endpoint: this.endpoint, signal: this.abort.signal, progress: () => {}, waitOnNetwork: true })
      .then((done) => {
        if (this.closed) return;
        this.clips = this.clips.filter((c) => c.id !== next.id);
        void store.remove(next.id);
        if (typeof done.remaining === "number") this.remaining = done.remaining;
        this.results.push({ id: next.id, idx: next.idx, key: next.key, replace: next.replace, before: next.before, text: done.text, via: done.via });
      })
      .catch((e: { status?: number; code?: string; message?: string; name?: string }) => {
        if (this.closed || e?.name === "AbortError") return;
        if (e?.code === "NO_WORDS") {
          // Nothing said in it after all (noise): the answer stays as it is.
          this.clips = this.clips.filter((c) => c.id !== next.id);
          void store.remove(next.id);
          return;
        }
        if (e?.status === undefined) {
          // No connection reached the server: wait.
          next.state = "waiting";
          this.later();
          return;
        }
        next.tries += 1;
        next.state = next.tries >= MAX_UPLOAD_TRIES || e.status === 422 ? "failed" : "waiting";
        next.error = e.message || "This recording could not be turned into text.";
        void store.put(next);
        if (next.state === "waiting") this.later();
      })
      .finally(() => {
        this.busy = false;
        if (this.closed) return;
        this.notify();
        // A retry that is waiting for its timer goes then; otherwise the next recording now.
        if (!this.timer) this.kick();
      });
  }
}
