import type pg from "pg";
import type { Request } from "express";
import { fail } from "./db.ts";
import { providerConfig } from "./providers.ts";

/**
 * Voice answers on the private team and kickoff links (the interview app). The recorded clip goes
 * to OpenAI (server/transcription.ts, gpt-4o-transcribe) only with the company's own OpenAI
 * connection or its approved firm binding, only after the person agreed, and never to disk: the
 * route reads the clip into memory, sends it, and returns the text.
 */

/** The recorder stops at 10 minutes; browsers that ignore its 32 kbps bitrate need more than 3 MB. Under OpenAI's 25 MB. */
export const LINK_AUDIO_LIMIT = "24mb";
export const LINK_AUDIO_TYPES = ["audio/webm", "audio/ogg", "audio/mp4", "audio/wav", "audio/mpeg"];

/**
 * The OpenAI key for one company's link, or "" when that company has none. The company is passed
 * explicitly: its own connection, or the firm key only through an approved firm binding. A
 * company scope never falls back to an operator environment key (server/providers.ts).
 */
export async function linkVoiceKey(db: pg.PoolClient, tenantId: string, companyId: string): Promise<string> {
  try {
    const config = await providerConfig(tenantId, "openai", db, companyId);
    return config.configured && config.key ? config.key : "";
  } catch {
    // A key that cannot be read (for example missing key storage) is the same as no key.
    return "";
  }
}

/** The person agreed that this recording may go to OpenAI (`?consent=true` or the header). */
export function requireTranscriptionConsent(req: Request) {
  const query = req.query as Record<string, unknown>;
  if (query.consent === "true" || req.header("X-Transcription-Consent") === "true") return;
  fail(
    428,
    "CONSENT_REQUIRED",
    "Agree that your recording is sent to OpenAI to turn it into text before you send it. Only the text is kept. You can type your answer instead.",
  );
}
