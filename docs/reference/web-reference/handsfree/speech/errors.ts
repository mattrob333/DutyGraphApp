import { fallsBackToRecorder, ignoredError } from "../../sponsor/live-voice-model.ts";
import type { SpeechSourceError } from "./types.ts";

/**
 * Browser error names and codes to the deck's speech errors. Pure, so the tests run it in Node.
 */

/** A getUserMedia rejection (DOMException name). */
export function micError(name: string | undefined): SpeechSourceError {
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") return { code: "permission_denied" };
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "NotSupportedError") return { code: "not_available" };
  return { code: "other", message: name || undefined };
}

/**
 * A Web Speech API `error` event code; null for codes that are part of normal listening. The codes
 * where LiveVoice switches to the recorder (Brave and some Chromium builds report "network") mean
 * live words do not work in this browser: `not_available`, so the deck moves to typing.
 */
export function recognitionError(code: string): SpeechSourceError | null {
  if (ignoredError(code)) return null;
  if (code === "not-allowed") return { code: "permission_denied" };
  if (fallsBackToRecorder(code)) return { code: "not_available" };
  return { code: "other", message: code };
}

/** Unix seconds or milliseconds to milliseconds (OpenAI's `expires_at` is seconds). */
export const expiresAtMs = (value: number) => (value > 0 && value < 1e12 ? value * 1000 : value);
