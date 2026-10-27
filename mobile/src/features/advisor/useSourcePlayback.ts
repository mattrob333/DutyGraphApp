import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { getAdvisorRepository } from "@/api/advisor";
import { useAdvisorStore } from "@/state/advisor";

const advisorScope = () => {
  const identity = useAdvisorStore.getState().identity;
  return identity ? `${identity.company.id}:${identity.advisor.id}` : null;
};

type Source = {
  uri: string;
  headers: Record<string, string>;
  offsetSeconds: number;
} | null;
type Status = {
  isLoaded: boolean;
  error: string | null;
  didJustFinish: boolean;
};
export interface SourcePlayerPort {
  pause(): void;
  remove(): void;
  play(): void;
  seekTo(seconds: number): Promise<void>;
  addListener(
    event: "playbackStatusUpdate",
    listener: (status: Status) => void,
  ): { remove(): void };
}
/** Every async stage checks its generation and the current company before audio can start. */
export class SourcePlayback {
  private generation = 0;
  private disposed = false;
  private player: SourcePlayerPort | null = null;
  private listener: { remove(): void } | null = null;
  constructor(
    private ports: {
      source(sessionId: string, startMs: number): Promise<Source>;
      create(source: Exclude<Source, null>): SourcePlayerPort;
      scope(): string | null;
      onError(message: string): void;
      onPlaying(playing: boolean): void;
    },
  ) {}
  stop() {
    this.generation++;
    this.listener?.remove();
    this.listener = null;
    this.player?.pause();
    this.player?.remove();
    this.player = null;
    if (!this.disposed) this.ports.onPlaying(false);
  }
  dispose() {
    this.disposed = true;
    this.stop();
  }
  async play(sessionId: string, startMs: number, recorded = true) {
    this.stop();
    const generation = this.generation,
      scope = this.ports.scope();
    const active = () =>
      !this.disposed &&
      generation === this.generation &&
      scope === this.ports.scope();
    if (!scope) return;
    this.ports.onError("");
    if (!recorded) {
      this.ports.onError(
        "This live note has no linked recording. Read the source quote.",
      );
      return;
    }
    try {
      const source = await this.ports.source(sessionId, startMs);
      if (!active()) return;
      if (!source) {
        this.ports.onError(
          "No matching recording is available. Read the source quote.",
        );
        return;
      }
      const player = this.ports.create(source);
      this.player = player;
      let started = false;
      this.listener = player.addListener("playbackStatusUpdate", (status) => {
        if (!active() || this.player !== player) return;
        if (status.error) {
          this.ports.onError("Audio is unavailable. Read the source quote.");
          this.stop();
          return;
        }
        if (status.isLoaded && !started) {
          started = true;
          void player
            .seekTo(source.offsetSeconds)
            .then(() => {
              if (!active() || this.player !== player) return;
              player.play();
              this.ports.onPlaying(true);
            })
            .catch(() => {
              if (active()) {
                this.ports.onError(
                  "Audio could not play. Read the source quote.",
                );
                this.stop();
              }
            });
        }
        if (status.didJustFinish) this.stop();
      });
    } catch {
      if (active()) {
        this.ports.onError("Audio is unavailable. Read the source quote.");
        this.stop();
      }
    }
  }
}

export function useSourcePlayback() {
  const [error, setError] = useState(""),
    [playing, setPlaying] = useState(false);
  const engine = useRef<SourcePlayback | null>(null);
  if (!engine.current)
    engine.current = new SourcePlayback({
      source: (id, startMs) => getAdvisorRepository().audioSource(id, startMs),
      create: (source) => {
        const audio = require("expo-audio") as typeof import("expo-audio");
        return audio.createAudioPlayer({
          uri: source.uri,
          headers: source.headers,
        });
      },
      scope: () => advisorScope(),
      onError: setError,
      onPlaying: setPlaying,
    });
  useEffect(() => {
    const state = AppState.addEventListener("change", (next) => {
      if (next !== "active") engine.current?.stop();
    });
    let company = advisorScope();
    const auth = useAdvisorStore.subscribe((next) => {
      if (advisorScope() !== company) {
        company = advisorScope();
        engine.current?.stop();
      }
    });
    return () => {
      state.remove();
      auth();
      engine.current?.dispose();
      engine.current = null;
    };
  }, []);
  return {
    error,
    playing,
    play: (id: string, startMs: number, recorded = true) =>
      engine.current!.play(id, startMs, recorded),
    stop: () => engine.current!.stop(),
  };
}
