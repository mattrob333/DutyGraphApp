import { config } from "@/api/config";
/** Audio-only caches contain hashes and audio; question text is held in memory only. */
export type VoiceLine = { id: string; text: string };
export const SIMULATED_VOICE_NOTICE =
  "Server speech is simulated. Device speech is used when available; otherwise, read the words on screen.";
export type VoiceEvent = { type: "start" | "end" | "error"; lineId: string };
export interface VoiceOut {
  readonly kind: "server" | "device" | "silent";
  prepare(lines: VoiceLine[]): Promise<void>;
  play(lineId: string): Promise<void>;
  speak(text: string, options?: { id?: string }): Promise<void>;
  stop(): void;
  subscribe(listener: (event: VoiceEvent) => void): () => void;
  dispose(): Promise<void>;
}
export interface VoiceLinesRepository {
  getVoiceLines(input: {
    requestId?: string;
    lines: VoiceLine[];
    speed?: number;
  }): Promise<{
    lines: {
      id: string;
      url: string;
      hash: string;
      durationMs: number;
      mimeType?: "audio/mpeg" | "audio/wav";
      simulated?: boolean;
    }[];
  }>;
}
export interface VoicePlaybackPort {
  play(uri: string): Promise<void>;
  stop(): void;
}
export interface VoiceCachePort {
  cache(
    url: string,
    hash: string,
    mimeType?: "audio/mpeg" | "audio/wav",
  ): Promise<string>;
}
export interface DeviceSpeechPort {
  speak(text: string, speed: number): Promise<void>;
  stop(): void;
}
export interface VoiceOutOptions {
  repository?: VoiceLinesRepository;
  requestId?: string;
  speed?: number;
  enabled?: boolean;
  allowedAudioOrigin?: string;
  downloadHeaders?: () => Promise<Record<string, string>>;
  playback?: VoicePlaybackPort;
  cache?: VoiceCachePort;
  device?: DeviceSpeechPort | null;
  onSimulation?: () => void;
}

const activeOutputs = new Set<VoiceOut>();

/** Each play owns a generation. A stopped or replaced line cannot emit a late end. */
class Output implements VoiceOut {
  private lines = new Map<string, string>();
  private audio = new Map<string, string>();
  private audioByText = new Map<string, string>();
  private preparations = Promise.resolve();
  private disposed = false;
  private listeners = new Set<(event: VoiceEvent) => void>();
  private generation = 0;
  private sequence = 0;
  private reportedSimulation = false;
  readonly kind: VoiceOut["kind"];
  constructor(private options: VoiceOutOptions) {
    activeOutputs.add(this);
    this.kind =
      options.enabled === false
        ? "silent"
        : options.repository
          ? "server"
          : options.device
            ? "device"
            : "silent";
  }
  subscribe(listener: (event: VoiceEvent) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private emit(type: VoiceEvent["type"], lineId: string) {
    this.listeners.forEach((f) => f({ type, lineId }));
  }
  async prepare(lines: VoiceLine[]) {
    if (this.disposed) return;
    lines = lines.filter((line) => this.lines.get(line.id) !== line.text);
    if (!lines.length) return;
    lines.forEach((line) => this.lines.set(line.id, line.text));
    const prepare = async () => {
      if (this.disposed || this.options.enabled === false) return;
      const missing: VoiceLine[] = [];
      for (const line of lines) {
        const uri = this.audioByText.get(line.text);
        if (uri) this.audio.set(line.id, uri);
        else missing.push(line);
      }
      if (!missing.length || !this.options.repository || !this.options.cache)
        return;
      try {
        const result = await this.options.repository.getVoiceLines({
          requestId: this.options.requestId,
          lines: missing,
          speed: this.options.speed ?? 1,
        });
        await Promise.all(
          result.lines.map(async (line) => {
            if (this.disposed) return;
            if (line.simulated) {
              if (!this.reportedSimulation) {
                this.reportedSimulation = true;
                this.options.onSimulation?.();
              }
              return;
            }
            if (!/^[a-f0-9]{64}$/i.test(line.hash)) return;
            try {
              const uri = await this.options.cache!.cache(
                line.url,
                line.hash,
                line.mimeType,
              );
              if (this.disposed) return;
              this.audio.set(line.id, uri);
              const text = this.lines.get(line.id);
              if (text) this.audioByText.set(text, uri);
            } catch {
              /* Device voice remains available. */
            }
          }),
        );
      } catch {
        /* Offline and older servers use device speech. */
      }
    };
    this.preparations = this.preparations.catch(() => {}).then(prepare);
    await this.preparations;
  }
  async play(lineId: string) {
    if (this.disposed) return;
    this.stop();
    const generation = this.generation;
    const text = this.lines.get(lineId);
    if (text == null) {
      this.emit("error", lineId);
      return;
    }
    this.emit("start", lineId);
    try {
      const uri = this.audio.get(lineId);
      let played = false;
      if (uri && this.options.playback && this.options.enabled !== false) {
        try {
          await this.options.playback.play(uri);
          played = true;
        } catch {
          /* Fall through to device. */
        }
      }
      if (generation !== this.generation) return;
      if (!played && this.options.device && this.options.enabled !== false)
        await this.options.device.speak(text, this.options.speed ?? 1);
      if (generation === this.generation) this.emit("end", lineId);
    } catch {
      if (generation === this.generation) this.emit("error", lineId);
    }
  }
  async speak(text: string, options?: { id?: string }) {
    this.stop();
    const generation = this.generation;
    const id = options?.id ?? `line-${++this.sequence}`;
    await this.prepare([{ id, text }]);
    if (!this.disposed && generation === this.generation) await this.play(id);
  }
  stop() {
    this.generation++;
    this.options.playback?.stop();
    this.options.device?.stop();
  }
  async dispose() {
    this.disposed = true;
    activeOutputs.delete(this);
    this.stop();
    this.listeners.clear();
    this.lines.clear();
    this.audio.clear();
    this.audioByText.clear();
  }
}

function devicePort(): DeviceSpeechPort | null {
  try {
    const speech = require("expo-speech") as typeof import("expo-speech");
    return {
      speak: (text, rate) =>
        new Promise((resolve, reject) =>
          speech.speak(text, {
            rate,
            onDone: resolve,
            onStopped: resolve,
            onError: reject,
          }),
        ),
      stop: () => {
        void speech.stop();
      },
    };
  } catch {
    return null;
  }
}
function playbackPort(): VoicePlaybackPort {
  let cancel: (() => void) | undefined;
  return {
    play: async (uri) => {
      const audio = require("expo-audio") as typeof import("expo-audio");
      await audio.setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        interruptionMode: "doNotMix",
        shouldRouteThroughEarpiece: false,
      });
      return new Promise<void>((resolve, reject) => {
        const player = audio.createAudioPlayer(uri);
        let finished = false;
        const finish = (error?: unknown) => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          subscription.remove();
          player.pause();
          player.remove();
          cancel = undefined;
          error ? reject(error) : resolve();
        };
        const subscription = player.addListener(
          "playbackStatusUpdate",
          (status) => {
            if (status.didJustFinish) finish();
          },
        );
        const timer = setTimeout(
          () => finish(new Error("Voice playback timed out")),
          90_000,
        );
        cancel = () => finish();
        try {
          player.play();
        } catch (error) {
          finish(error);
        }
      });
    },
    stop: () => cancel?.(),
  };
}
let cacheGeneration = 0;
export async function clearVoiceAudioCache() {
  cacheGeneration++;
  await Promise.all([...activeOutputs].map((output) => output.dispose()));
  const { clearCardBackupCache } =
    require("../cardBackup") as typeof import("../cardBackup");
  await clearCardBackupCache();
  try {
    const { Directory, File, Paths } =
      require("expo-file-system") as typeof import("expo-file-system");
    for (const item of new Directory(Paths.cache).list())
      if (item instanceof File && item.name.startsWith("voice-")) item.delete();
  } catch {
    /* No cache in this build. */
  }
}
function cachePort(
  headers?: () => Promise<Record<string, string>>,
  allowedOrigin?: string,
): VoiceCachePort {
  return {
    cache: async (url, hash, mimeType) => {
      const origin = new URL(
        allowedOrigin ?? (config.meetingsApiBaseUrl || config.apiBaseUrl),
      ).origin;
      const resource = new URL(url, origin);
      if (
        resource.origin !== origin ||
        resource.username ||
        resource.password ||
        resource.search ||
        resource.hash ||
        !/^\/api\/mobile\/v1x\/voice\/audio\/[a-f0-9]{64}(?:\.(?:mp3|wav))?$/i.test(
          resource.pathname,
        )
      )
        throw new Error("Untrusted voice audio URL");
      const extension =
        mimeType === "audio/wav"
          ? "wav"
          : mimeType === "audio/mpeg" || resource.pathname.endsWith(".mp3")
            ? "mp3"
            : undefined;
      if (
        !extension ||
        (resource.pathname.endsWith(".wav") && extension !== "wav") ||
        (resource.pathname.endsWith(".mp3") && extension !== "mp3")
      )
        throw new Error("Voice audio format is unavailable");
      const generation = cacheGeneration;
      const { File, Paths } =
        require("expo-file-system") as typeof import("expo-file-system");
      const target = new File(Paths.cache, `voice-${hash}.${extension}`);
      if (!target.exists)
        await File.downloadFileAsync(resource.toString(), target, {
          idempotent: true,
          headers: await headers?.(),
        });
      if (generation !== cacheGeneration) {
        if (target.exists) target.delete();
        throw new Error("Voice cache cleared");
      }
      return target.uri;
    },
  };
}
export function createVoiceOut(options: VoiceOutOptions = {}): VoiceOut {
  return new Output({
    ...options,
    device: options.device === undefined ? devicePort() : options.device,
    playback: options.playback ?? playbackPort(),
    cache:
      options.cache ??
      cachePort(options.downloadHeaders, options.allowedAudioOrigin),
  });
}
