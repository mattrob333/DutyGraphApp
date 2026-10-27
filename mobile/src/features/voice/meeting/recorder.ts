export const SEGMENT_MS = 5 * 60 * 1000;
export const UPLOAD_BYTES = 512 * 1024;
export type RecordedSegment = {
  id: string;
  uri: string;
  hash: string;
  bytes: number;
  durationMs: number;
  uploadedBytes: number;
};
export type RecorderManifest = {
  sessionId: string;
  segments: RecordedSegment[];
};
export interface MeetingRecorderPorts {
  recorder: {
    start(): Promise<void>;
    stop(): Promise<{ uri: string; durationMs: number } | null>;
    pause?(): void;
    readonly available: boolean;
    readonly simulated?: boolean;
  };
  files: {
    persist(uri: string, id: string): Promise<string>;
    bytes(uri: string): Promise<Uint8Array>;
    hash(bytes: Uint8Array): Promise<string>;
  };
  storage: {
    load(sessionId: string): Promise<RecorderManifest | null>;
    save(manifest: RecorderManifest): Promise<void>;
  };
  upload(input: {
    sessionId: string;
    segment: RecordedSegment;
    offset: number;
    bytes: Uint8Array;
    final: boolean;
  }): Promise<{ uploadedBytes: number }>;
  timer?: {
    set(fn: () => void, ms: number): unknown;
    clear(handle: unknown): void;
  };
}
/** Retains durable evidence until acknowledged. Upload progress is checkpointed per 512 KiB part. */
export class MeetingRecorder {
  private manifest: RecorderManifest;
  private state: "idle" | "recording" | "paused" | "stopped" = "idle";
  private timer: unknown;
  private lastError: string | null = null;
  private serial = Promise.resolve();
  private unsealed: { uri: string; durationMs: number; id: string } | null =
    null;
  private needsSave = false;
  private uploadRun: Promise<void> | null = null;
  readonly isAvailable: boolean;
  readonly isSimulated: boolean;
  private clock;
  constructor(
    private sessionId: string,
    private ports: MeetingRecorderPorts,
  ) {
    this.manifest = { sessionId, segments: [] };
    this.isAvailable = ports.recorder.available;
    this.isSimulated = !!ports.recorder.simulated;
    this.clock = ports.timer ?? {
      set: (fn: () => void, ms: number) => setTimeout(fn, ms),
      clear: (id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>),
    };
  }
  get error() {
    return this.lastError;
  }
  interrupt(message: string) {
    this.lastError = message;
    return this.pause();
  }
  get status() {
    return this.state;
  }
  get segments() {
    return this.manifest.segments.map((segment) => ({ ...segment }));
  }
  async restore() {
    if (!this.needsSave && !this.unsealed)
      this.manifest =
        (await this.ports.storage.load(this.sessionId)) ?? this.manifest;
    return this.segments;
  }
  private enqueue(action: () => Promise<void>) {
    const next = this.serial.then(action);
    this.serial = next.catch(() => {});
    return next;
  }
  start() {
    return this.enqueue(async () => {
      if (!this.isAvailable)
        throw new Error("Recording is unavailable on this build");
      if (this.state === "recording") return;
      await this.restore();
      await this.recover();
      await this.ports.recorder.start();
      this.lastError = null;
      this.state = "recording";
      this.schedule();
    });
  }
  private schedule() {
    this.clock.clear(this.timer);
    this.timer = this.clock.set(() => {
      void this.enqueue(async () => {
        if (this.state !== "recording") return;
        this.state = "paused";
        await this.seal();
        await this.ports.recorder.start();
        this.lastError = null;
        this.state = "recording";
        this.schedule();
      }).catch(() => {
        this.state = "paused";
      });
    }, SEGMENT_MS);
  }
  private async recover() {
    if (this.unsealed) await this.seal();
    if (this.needsSave) {
      await this.ports.storage.save(this.manifest);
      this.needsSave = false;
    }
    // The native journal can recover a stopped file when an OS or disk error interrupted sealing.
    const recovered = await this.ports.storage.load(this.sessionId);
    if (recovered)
      for (const segment of recovered.segments)
        if (!this.manifest.segments.some((item) => item.id === segment.id))
          this.manifest.segments.push(segment);
  }
  private async seal() {
    if (!this.unsealed) {
      const clip = await this.ports.recorder.stop();
      if (!clip || clip.durationMs <= 0) return;
      this.unsealed = {
        ...clip,
        id: `${this.sessionId}-${Date.now()}-${this.manifest.segments.length}`,
      };
    }
    const { id, durationMs } = this.unsealed;
    const uri = await this.ports.files.persist(this.unsealed.uri, id);
    this.unsealed.uri = uri;
    const bytes = await this.ports.files.bytes(uri);
    const hash = await this.ports.files.hash(bytes);
    if (!this.manifest.segments.some((segment) => segment.id === id))
      this.manifest.segments.push({
        id,
        uri,
        hash,
        bytes: bytes.length,
        durationMs,
        uploadedBytes: 0,
      });
    this.needsSave = true;
    this.unsealed = null;
    await this.ports.storage.save(this.manifest);
    this.needsSave = false;
  }
  pause() {
    this.clock.clear(this.timer);
    return this.enqueue(async () => {
      if (this.state !== "recording") return;
      this.state = "paused";
      await this.seal();
    });
  }
  resume() {
    return this.enqueue(async () => {
      if (this.state !== "paused") return;
      await this.recover();
      await this.ports.recorder.start();
      this.lastError = null;
      this.state = "recording";
      this.schedule();
    });
  }
  stop() {
    this.clock.clear(this.timer);
    return this.enqueue(async () => {
      if (this.state === "recording") {
        this.state = "paused";
        await this.seal();
      }
      await this.recover();
      this.state = "stopped";
    });
  }
  uploadPending() {
    if (this.uploadRun) return this.uploadRun;
    this.uploadRun = (async () => {
      await this.serial;
      for (const segment of this.manifest.segments) {
        const data = await this.ports.files.bytes(segment.uri);
        if ((await this.ports.files.hash(data)) !== segment.hash)
          throw new Error("The recording checksum did not match");
        while (segment.uploadedBytes < data.length) {
          const offset = segment.uploadedBytes;
          const end = Math.min(offset + UPLOAD_BYTES, data.length);
          const ack = await this.ports.upload({
            sessionId: this.sessionId,
            segment: { ...segment },
            offset,
            bytes: data.slice(offset, end),
            final: end === data.length,
          });
          if (!Number.isInteger(ack.uploadedBytes) || ack.uploadedBytes !== end)
            throw new Error(
              "The server did not acknowledge this recording part",
            );
          segment.uploadedBytes = ack.uploadedBytes;
          await this.ports.storage.save(this.manifest);
        }
      }
    })().finally(() => {
      this.uploadRun = null;
    });
    return this.uploadRun;
  }
}
