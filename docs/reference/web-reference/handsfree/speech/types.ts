/**
 * Where the hands-free cards get live words on the web (docs/specs/COMPANION-HANDS-FREE.md §9.1).
 * Three sources, tried in this order:
 * - `openai`: OpenAI live transcription over a WebSocket, with a short-lived key minted by our
 *   server (POST /api/invitations/:token/team/live-transcription).
 * - `browser`: the browser's own speech recognition (Web Speech API), as LiveVoice uses today.
 * - `none`: no live words; the deck runs in typing mode.
 *
 * The deck owns the timing: "no new words for N ms" is a pause. On a pause the deck calls
 * `commit()` so the openai source asks for the final text of that turn.
 */
export type SpeechSourceKind = "openai" | "browser" | "none";

export type SpeechSourceError =
  | { code: "permission_denied" }
  | { code: "not_available" }
  | { code: "network" }
  /** The audio route changed under the session (earbuds connected or dropped, the track ended): restart it. */
  | { code: "device_changed" }
  | { code: "other"; message?: string };

export type SpeechHandlers = {
  /** The full text heard since `start`, partial words included. Replaces the previous value. */
  onText: (text: string) => void;
  /** Microphone level 0..1, about 10 times a second, for the caption box bars. Optional. */
  onLevel?: (level: number) => void;
  onError: (error: SpeechSourceError) => void;
  /**
   * The microphone stream this run opened (null when it closes), so the deck can keep a recording
   * of each spoken card on the same stream (October 19: the recorded backup). Optional.
   */
  onStream?: (stream: MediaStream | null) => void;
  /**
   * Live words stopped (true) or came back (false) while the microphone keeps running: no signal on
   * a drive, a recognizer the phone stopped. Given only when the caller passes it; without it those
   * cases are errors as before. The source keeps retrying on its own meanwhile.
   */
  onTrouble?: (trouble: boolean) => void;
};

export type SpeechStartOptions = {
  /** A microphone chosen on the consent screen (live-voice-model.ts); default device when absent. */
  deviceId?: string;
  /** BCP-47, e.g. "en-US". */
  lang: string;
};

export interface SpeechSource {
  readonly kind: SpeechSourceKind;
  /** Opens the microphone and starts listening. Resolves once audio is flowing. */
  start(options: SpeechStartOptions, handlers: SpeechHandlers): Promise<void>;
  /** The deck saw a pause: finish the current turn (openai: input_audio_buffer.commit). No-op elsewhere. */
  commit(): void;
  /**
   * A new card while the microphone keeps running (October 19): forget the words so far, so `onText`
   * carries only what is said from now on. The microphone and the recognizer are not restarted,
   * because restarting them at every card left phones with Bluetooth earbuds deaf after card 1.
   */
  reset(): void;
  /** Stops, releases the microphone and closes any connection. Safe to call twice. */
  stop(): Promise<void>;
}

/** What the server returns for a live transcription key (spec §9.2). */
export type LiveTranscriptionGrant =
  | {
      available: true;
      clientSecret: string;
      /** When the key expires: Unix seconds (OpenAI's `expires_at`) or milliseconds; the source accepts both. */
      expiresAt: number;
      wsUrl: string;
      model: string;
      /**
       * Optional: the transcription settings the key was minted with, so the browser's one
       * session.update repeats them instead of clearing them. Without it the update carries the
       * model and the language only.
       */
      transcription?: { languages?: string[]; keywords?: string[]; prompt?: string; delay?: string };
    }
  | { available: false; reason: string };
