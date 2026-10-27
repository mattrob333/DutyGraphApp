import type { FacilitatorTrigger } from "../facilitator";
export type RealtimeGrant =
  | { available: true; sdp: string; model: string }
  | {
      available: true;
      clientSecret: string;
      model: string;
      simulated?: boolean;
    }
  | { available: false; reason: string };
export type RealtimeMessage = Record<string, unknown>;
export type RealtimeTransportEvent =
  | { type: "open" }
  | { type: "message"; message: RealtimeMessage }
  | { type: "error" | "close" };
export interface RealtimeTransport {
  createOffer(): Promise<string>;
  acceptAnswer(sdp: string): Promise<void>;
  send(message: RealtimeMessage): void;
  setOutputEnabled(enabled: boolean): void;
  subscribe(listener: (event: RealtimeTransportEvent) => void): () => void;
  close(): void;
}
export type RealtimeState =
  "idle" | "connecting" | "ready" | "error" | "closed";
export interface RealtimeOptions {
  enabled: boolean;
  available: boolean;
  canBegin(): boolean;
  transport(): RealtimeTransport;
  mint(
    sessionId: string,
    input: { sdp: string; summary?: string },
  ): Promise<RealtimeGrant>;
  summary?(): string;
  /** A conservative local stream bound, separate from the server's measured budget. */
  lifetimeMs?(): number;
  onSpeech?(speaking: boolean): void;
  onTranscript?(text: string): void;
  onState?(state: RealtimeState, message?: string): void;
  now?(): number;
  timers?: {
    set(callback: () => void, ms: number): unknown;
    clear(handle: unknown): void;
  };
}
export const REALTIME_TRIGGERS: readonly FacilitatorTrigger[] = [
  "opening",
  "timebox_end",
  "silence",
  "leader_next",
  "slot_empty",
  "closing",
];
