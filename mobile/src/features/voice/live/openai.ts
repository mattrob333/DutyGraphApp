import type {
  LiveSpeech,
  LiveSpeechHandlers,
  LiveSpeechStartOptions,
} from "./types";
export type TranscriptionGrant =
  | { available: false; reason?: string }
  | {
      available: true;
      secret: string;
      url?: string;
      model?: string;
      keywords?: string[];
    };
export interface PcmCapture {
  readonly available: boolean;
  start(
    onSamples: (samples: Float32Array, sampleRate: number) => void,
  ): Promise<void>;
  stop(): Promise<void>;
}
export interface SocketPort {
  readyState: number;
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onerror: (() => void) | null;
  onclose: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
}
export const TRANSCRIPTION_PROMPT =
  "An employee describes their own work for their company's advisor: the steps, the tools and systems, the people and teams, waits and decisions.";
export function cleanKeywords(values: string[]) {
  return [
    ...new Set(
      values
        .map((s) =>
          s
            .replace(/[<>\r\n]/g, " ")
            .trim()
            .slice(0, 40),
        )
        .filter(Boolean),
    ),
  ].slice(0, 40);
}
export function transcriptionSession(
  grant: Extract<TranscriptionGrant, { available: true }>,
) {
  return {
    type: "session.update",
    session: {
      type: "transcription",
      audio: {
        input: {
          format: { type: "audio/pcm", rate: 24000 },
          transcription: {
            model: grant.model ?? "gpt-live-transcribe",
            languages: ["en"],
            keywords: cleanKeywords(grant.keywords ?? []),
            prompt: TRANSCRIPTION_PROMPT,
            delay: "low",
          },
          turn_detection: null,
          noise_reduction: { type: "near_field" },
        },
      },
    },
  };
}
/** Linear resampling, clamping and explicit little-endian PCM16. */
export function pcm16(samples: Float32Array, sourceRate: number): Uint8Array {
  if (!Number.isFinite(sourceRate) || sourceRate <= 0)
    throw new Error("Invalid sample rate");
  const length = Math.floor((samples.length * 24000) / sourceRate);
  const bytes = new Uint8Array(length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < length; i++) {
    const position = (i * sourceRate) / 24000;
    const low = Math.floor(position);
    const fraction = position - low;
    const value = Math.max(
      -1,
      Math.min(
        1,
        samples[low] * (1 - fraction) +
          (samples[Math.min(low + 1, samples.length - 1)] ?? 0) * fraction,
      ),
    );
    view.setInt16(i * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
  }
  return bytes;
}
export function base64(bytes: Uint8Array): string {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n =
      (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out +=
      alphabet[(n >>> 18) & 63] +
      alphabet[(n >>> 12) & 63] +
      (i + 1 < bytes.length ? alphabet[(n >>> 6) & 63] : "=") +
      (i + 2 < bytes.length ? alphabet[n & 63] : "=");
  }
  return out;
}
export class TranscriptItems {
  private items = new Map<string, string>();
  reset() {
    this.items.clear();
  }
  apply(event: {
    type?: string;
    item_id?: string;
    delta?: string;
    transcript?: string;
  }): string | null {
    if (!event.item_id) return null;
    if (event.type === "conversation.item.input_audio_transcription.delta")
      this.items.set(
        event.item_id,
        (this.items.get(event.item_id) ?? "") + (event.delta ?? ""),
      );
    else if (
      event.type === "conversation.item.input_audio_transcription.completed"
    )
      this.items.set(event.item_id, event.transcript ?? "");
    else return null;
    return [...this.items.values()]
      .map((s) => s.trim())
      .filter(Boolean)
      .join(" ");
  }
}
export class OpenAiLiveSpeech implements LiveSpeech {
  readonly kind = "openai" as const;
  readonly source = "voice_openai" as const;
  private socket: SocketPort | null = null;
  private items = new TranscriptItems();
  private run = 0;
  private cancelOpen: (() => void) | undefined;
  constructor(
    private options: {
      grant: () => Promise<TranscriptionGrant>;
      capture: PcmCapture;
      socket?: (url: string, protocols: string[]) => SocketPort;
    },
  ) {}
  reset() {
    this.items.reset();
  }
  commit() {
    if (this.socket?.readyState === 1)
      this.socket.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
  }
  async start(_options: LiveSpeechStartOptions, handlers: LiveSpeechHandlers) {
    await this.stop();
    const run = ++this.run;
    if (!this.options.capture.available) {
      handlers.onError({ code: "not_available" });
      return;
    }
    try {
      // A rejected/expired kept key gets one fresh grant before device fallback.
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const grant = await this.options.grant();
          if (run !== this.run) return;
          if (!grant.available) throw new Error("Unavailable");
          await this.open(grant, run, handlers);
          return;
        } catch {
          this.socket?.close();
          this.socket = null;
          await this.options.capture.stop().catch(() => {});
          if (run !== this.run) return;
        }
      }
      handlers.onError({ code: "network" });
    } catch {
      if (run === this.run) handlers.onError({ code: "network" });
    }
  }
  private async open(
    grant: Extract<TranscriptionGrant, { available: true }>,
    run: number,
    handlers: LiveSpeechHandlers,
  ) {
    const socket = (
      this.options.socket ??
      ((url, protocols) =>
        new WebSocket(url, protocols) as unknown as SocketPort)
    )(grant.url ?? "wss://api.openai.com/v1/realtime?intent=transcription", [
      "realtime",
      `openai-insecure-api-key.${grant.secret}`,
    ]);
    this.socket = socket;
    await new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => {
        clearTimeout(timeout);
        this.cancelOpen = undefined;
        error ? reject(error) : resolve();
      };
      const timeout = setTimeout(
        () => finish(new Error("Socket timeout")),
        5000,
      );
      this.cancelOpen = () => finish(new Error("Stopped"));
      socket.onopen = () => {
        if (run !== this.run) return finish(new Error("Stopped"));
        socket.send(JSON.stringify(transcriptionSession(grant)));
        finish();
      };
      socket.onerror = () => finish(new Error("Socket failed"));
      socket.onclose = () => finish(new Error("Socket closed"));
    });
    socket.onerror = socket.onclose = () => {
      if (run === this.run) handlers.onError({ code: "network" });
    };
    socket.onmessage = (event) => {
      if (run !== this.run) return;
      try {
        const message = JSON.parse(event.data);
        const text = this.items.apply(message);
        if (text != null) handlers.onText(text);
        if (message.type === "error") handlers.onError({ code: "network" });
      } catch {
        /* Ignore malformed provider frames. */
      }
    };
    await this.options.capture.start((samples, rate) => {
      if (run !== this.run || socket.readyState !== 1) return;
      const level = Math.sqrt(
        samples.reduce((sum, value) => sum + value * value, 0) /
          Math.max(1, samples.length),
      );
      handlers.onLevel?.(level);
      socket.send(
        JSON.stringify({
          type: "input_audio_buffer.append",
          audio: base64(pcm16(samples, rate)),
        }),
      );
    });
  }
  async stop() {
    this.run++;
    this.cancelOpen?.();
    this.cancelOpen = undefined;
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.onclose = socket.onerror = socket.onmessage = socket.onopen = null;
      socket.close();
    }
    await this.options.capture.stop();
    this.reset();
  }
}
/** Native Expo Audio records encoded files; it does not expose microphone PCM frames. */
export const unavailablePcmCapture: PcmCapture = {
  available: false,
  start: async () => {
    throw new Error(
      "Raw microphone PCM requires a development-build capture module",
    );
  },
  stop: async () => {},
};
