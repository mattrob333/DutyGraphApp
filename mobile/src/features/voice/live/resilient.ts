import type {
  LiveSpeech,
  LiveSpeechHandlers,
  LiveSpeechStartOptions,
} from "./types";
/** A single fallback preserves the card's words and advertises the service actually in use. */
export class ResilientLiveSpeech implements LiveSpeech {
  get kind() {
    return this.current.kind;
  }
  get source() {
    return this.current.source ?? "voice_device";
  }
  private current: LiveSpeech;
  private fallbackUsed = false;
  private prefix = "";
  private text = "";
  private soundSince: number | null = null;
  private lastWords = 0;
  private restarts = 0;
  private run = 0;
  constructor(
    private primary: LiveSpeech,
    private fallback: LiveSpeech,
    private now = Date.now,
  ) {
    this.current = primary;
  }
  async start(options: LiveSpeechStartOptions, handlers: LiveSpeechHandlers) {
    const run = ++this.run;
    this.prefix = this.text = "";
    this.restarts = 0;
    this.soundSince = null;
    this.lastWords = this.now();
    const start = async (): Promise<void> =>
      this.current.start(options, {
        onText: (text) => {
          if (run !== this.run) return;
          this.text = text;
          this.lastWords = this.now();
          this.soundSince = null;
          handlers.onText([this.prefix, text].filter(Boolean).join(" "));
        },
        onPause: () => handlers.onPause?.(),
        onLevel: (level) => {
          handlers.onLevel?.(level);
          if (level < 0.03) {
            this.soundSince = null;
            return;
          }
          const now = this.now();
          this.soundSince ??= now;
          if (now - Math.max(this.soundSince, this.lastWords) < 6000) return;
          this.soundSince = now;
          if (this.restarts++ < 3) {
            this.prefix = [this.prefix, this.text].filter(Boolean).join(" ");
            this.text = "";
            void this.current
              .stop()
              .then(start)
              .catch(() => handlers.onError({ code: "other" }));
          } else
            void fail({ code: "not_available" }).catch(() =>
              handlers.onError({ code: "other" }),
            );
        },
        onError: (error) => {
          void fail(error).catch(() => handlers.onError({ code: "other" }));
        },
      });
    const fail = async (
      error: Parameters<LiveSpeechHandlers["onError"]>[0],
    ) => {
      if (run !== this.run) return;
      if (
        !this.fallbackUsed &&
        this.current === this.primary &&
        error.code !== "permission_denied"
      ) {
        this.fallbackUsed = true;
        this.prefix = [this.prefix, this.text].filter(Boolean).join(" ");
        this.text = "";
        await this.current.stop();
        if (run !== this.run) return;
        this.current = this.fallback;
        await start();
      } else handlers.onError(error);
    };
    await start();
  }
  async reset(options?: LiveSpeechStartOptions) {
    this.prefix = this.text = "";
    this.restarts = 0;
    this.soundSince = null;
    this.lastWords = this.now();
    await this.current.reset?.(options);
  }
  commit() {
    this.current.commit?.();
  }
  async stop() {
    this.run++;
    await this.current.stop();
  }
}
