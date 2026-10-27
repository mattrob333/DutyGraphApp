import type pg from "pg";
import { audit } from "./db.ts";
import { publicUser } from "./auth.ts";
import { featureConfig } from "./feature-config.ts";
import type { HandsFreeQuestion } from "../shared/hands-free/types.ts";

/**
 * OpenAI live transcription for the web hands-free cards (docs/specs/COMPANION-HANDS-FREE.md §9.2).
 * The server mints a short-lived client secret for a transcription-only session; the browser opens
 * the WebSocket with it. The platform key stays on the server and never appears in a response,
 * a log, an audit event or an error. Every refusal or upstream failure is `available: false`
 * with a reason, and the page falls back to browser speech or typing.
 *
 * Parts are unverified until a real key is used (the WebSocket URL, `delay` and `prompt` with this
 * model), so the model, delay, URLs and lifetime come from the environment.
 */

/** Limits in 24 hours, counted by the audit event below. */
export const LIVE_TRANSCRIPTION_PER_REQUEST = 12;
export const LIVE_TRANSCRIPTION_PER_TENANT = 400;
export const LIVE_TRANSCRIPTION_EVENT = "team.live_transcription_started";
export const LIVE_TRANSCRIPTION_TIMEOUT_MS = 5000;
export const LIVE_KEYWORDS_MAX = 40;
export const LIVE_KEYWORD_LENGTH = 40;
/** Fixed and plain: who is talking and about what. Never the person's words or the questions. */
export const LIVE_TRANSCRIPTION_PROMPT =
  "An employee describes their own work for their company's advisor: the steps, the tools and systems, the people and teams, waits and decisions.";

const DEFAULTS = {
  model: "gpt-live-transcribe",
  delay: "low",
  wsUrl: "wss://api.openai.com/v1/realtime?intent=transcription",
  seconds: 600,
  baseUrl: "https://api.openai.com/v1",
};

export type LiveTranscriptionConfig = {
  key: string;
  model: string;
  /** Omitted from the session when empty. */
  delay: string;
  wsUrl: string;
  seconds: number;
  baseUrl: string;
};

export type LiveTranscriptionGrant =
  | {
      available: true;
      clientSecret: string;
      expiresAt: number;
      wsUrl: string;
      model: string;
      /** The settings the key was minted with, so the browser's one session.update repeats them. */
      transcription: { languages: string[]; keywords?: string[]; prompt: string; delay?: string };
    }
  | { available: false; reason: string };

export type LiveTranscriptionGate =
  | { reason: string }
  | { reason: ""; config: LiveTranscriptionConfig; keywords: string[] };

export type LiveTranscriptionOptions = {
  /** Tests inject a fake OpenAI. */
  transport?: typeof fetch;
  timeoutMs?: number;
};

/**
 * Read at call time. Malformed values fall back to the defaults. The base URL override (tests and
 * the local fake server) is ignored when hosted, so the platform key only ever goes to OpenAI.
 */
export function liveTranscriptionConfig(env: NodeJS.ProcessEnv = process.env): LiveTranscriptionConfig {
  const hosted = featureConfig(env).hosted;
  const model = (env.OPENAI_LIVE_TRANSCRIBE_MODEL || "").trim();
  const delay = env.OPENAI_LIVE_TRANSCRIBE_DELAY === undefined ? DEFAULTS.delay : env.OPENAI_LIVE_TRANSCRIBE_DELAY.trim();
  const wsUrl = (env.OPENAI_LIVE_TRANSCRIBE_WS_URL || "").trim();
  const seconds = Number.parseInt((env.OPENAI_LIVE_TRANSCRIBE_SECONDS || "").trim(), 10);
  const baseUrl = (env.OPENAI_API_BASE_URL || "").trim().replace(/\/+$/, "");
  return {
    key: (env.OPENAI_LIVE_TRANSCRIBE_API_KEY || "").trim(),
    model: /^[A-Za-z0-9._:-]{1,100}$/.test(model) ? model : DEFAULTS.model,
    delay: /^[a-z_]{0,20}$/.test(delay) ? delay : DEFAULTS.delay,
    wsUrl: (hosted ? /^wss:\/\/[^\s]+$/ : /^wss?:\/\/[^\s]+$/).test(wsUrl) && wsUrl.length <= 500 ? wsUrl : DEFAULTS.wsUrl,
    seconds: Number.isFinite(seconds) ? Math.min(7200, Math.max(10, seconds)) : DEFAULTS.seconds,
    baseUrl: !hosted && /^https?:\/\/[^\s]+$/.test(baseUrl) ? baseUrl : DEFAULTS.baseUrl,
  };
}

/**
 * The socket origin the page connects to, for the production CSP's connect-src: none without a key.
 * vercel.json (static pages when hosted) allows the default origin, wss://api.openai.com.
 */
export function liveTranscriptionSocketOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const config = liveTranscriptionConfig(env);
  if (!config.key) return [];
  try {
    const url = new URL(config.wsUrl);
    return [`${url.protocol}//${url.host}`];
  } catch {
    return [];
  }
}

/** One keyword line: no `<`, `>` or line breaks, single spaces, at most 40 characters (cut at a word when it can). */
export function cleanKeyword(value: string) {
  const line = value.replace(/[<>\r\n]/g, " ").replace(/\s+/g, " ").trim();
  if (line.length <= LIVE_KEYWORD_LENGTH) return line;
  const cut = line.slice(0, LIVE_KEYWORD_LENGTH + 1).lastIndexOf(" ");
  return (cut > 0 ? line.slice(0, cut) : line.slice(0, LIVE_KEYWORD_LENGTH)).trim();
}

const NAME_WORD = /^(?:[A-Z][A-Za-z0-9&'.-]*|[A-Za-z]*[0-9][A-Za-z0-9-]*)$/;
const NOT_NAMES = new Set(["I", "I'm", "I'd", "I've", "I'll", "OK"]);

/** Names and systems in a line: capitalised words after the first of a sentence, CamelCase, acronyms. */
function namesIn(text: string): string[] {
  const out: string[] = [];
  for (const sentence of text.split(/[.?!:;…()"“”]+/)) {
    const words = sentence.split(/[\s,/]+/).filter(Boolean);
    let run: string[] = [];
    const flush = () => {
      if (run.length) out.push(run.join(" "));
      run = [];
    };
    words.forEach((word, i) => {
      const w = word.replace(/^['-]+|['-]+$/g, "");
      const inner = /[a-z][A-Z]/.test(w) || /^[A-Z]{2,}$/.test(w);
      if (w && !NOT_NAMES.has(w) && NAME_WORD.test(w) && (i > 0 || inner)) run.push(w);
      else flush();
    });
    flush();
  }
  return out;
}

/**
 * Words the transcriber should spell right: the company name, then names and systems in the
 * request's questions and hints (titles, chip labels, nudges). Cues are lower-case matching words
 * and are left out. Cleaned, deduplicated (any case) and capped at 40.
 */
export function liveKeywords(companyName: string, questions: HandsFreeQuestion[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (value: string) => {
    const word = cleanKeyword(value);
    if (!word || out.length >= LIVE_KEYWORDS_MAX || seen.has(word.toLowerCase())) return;
    seen.add(word.toLowerCase());
    out.push(word);
  };
  add(companyName);
  for (const question of questions)
    for (const line of [question.text, question.short, ...question.hints.flatMap((h) => [h.label, h.nudge])]) namesIn(line.replace(/[<>]/g, " ")).forEach(add);
  return out;
}

/**
 * Inside the link's tenant transaction, after the link and request are checked: never for a sample
 * company, the platform key, the limits, then an audit event (person and model only).
 */
export async function liveTranscriptionGate(
  db: pg.PoolClient,
  p: { tenantId: string; companyId: string; requestId: string; personId: string; questions: HandsFreeQuestion[] },
): Promise<LiveTranscriptionGate> {
  const company = (await db.query("SELECT name, sandbox FROM companies WHERE id=$1", [p.companyId])).rows[0];
  if (!company || company.sandbox) return { reason: "SAMPLE_COMPANY" };
  const config = liveTranscriptionConfig();
  if (!config.key) return { reason: "NOT_CONFIGURED" };
  await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [p.tenantId + ":live-transcription"]);
  const counts = (
    await db.query(
      "SELECT count(*) FILTER (WHERE record_id=$2) AS mine, count(*) AS tenant FROM audit_events WHERE tenant_id=$1 AND type=$3 AND created_at>now()-interval '24 hours'",
      [p.tenantId, p.requestId, LIVE_TRANSCRIPTION_EVENT],
    )
  ).rows[0];
  if (Number(counts.mine) >= LIVE_TRANSCRIPTION_PER_REQUEST || Number(counts.tenant) >= LIVE_TRANSCRIPTION_PER_TENANT)
    return { reason: "LIVE_TRANSCRIPTION_LIMIT" };
  const owner = (
    await db.query("SELECT u.* FROM record_versions v JOIN users u ON u.id=v.actor_id WHERE v.record_id=$1 AND v.tenant_id=$2 ORDER BY v.version LIMIT 1", [p.requestId, p.tenantId])
  ).rows[0];
  if (!owner) return { reason: "SPONSOR_UNAVAILABLE" };
  await audit(db, publicUser(owner), p.companyId, LIVE_TRANSCRIPTION_EVENT, p.requestId, { personId: p.personId, model: config.model });
  return { reason: "", config, keywords: liveKeywords(String(company.name || ""), p.questions) };
}

/** The transcription settings of the session: the key's body and the browser's session.update. */
export function transcriptionSettings(config: LiveTranscriptionConfig, keywords: string[]) {
  return {
    languages: ["en"],
    ...(keywords.length ? { keywords } : {}),
    prompt: LIVE_TRANSCRIPTION_PROMPT,
    ...(config.delay ? { delay: config.delay } : {}),
  };
}

/** The body for POST {base}/realtime/client_secrets (a transcription-only session, no turn detection). */
export function clientSecretBody(config: LiveTranscriptionConfig, keywords: string[]) {
  return {
    expires_after: { anchor: "created_at", seconds: config.seconds },
    session: {
      type: "transcription",
      audio: {
        input: {
          format: { type: "audio/pcm", rate: 24000 },
          transcription: { model: config.model, ...transcriptionSettings(config, keywords) },
          turn_detection: null,
          noise_reduction: { type: "near_field" },
        },
      },
    },
  };
}

/**
 * The OpenAI call, outside the transaction. A non-2xx answer, a timeout, a network error or an
 * answer without a usable secret is `available: false`; the upstream body is never read into a
 * reason or a log (an error message can quote part of the key).
 */
export async function mintLiveTranscription(gate: LiveTranscriptionGate, opts: LiveTranscriptionOptions = {}): Promise<LiveTranscriptionGrant> {
  if (!("config" in gate)) return { available: false, reason: gate.reason };
  const { config, keywords } = gate;
  const transport = opts.transport ?? fetch;
  let response: Response;
  try {
    response = await transport(`${config.baseUrl}/realtime/client_secrets`, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(opts.timeoutMs ?? LIVE_TRANSCRIPTION_TIMEOUT_MS),
      headers: { Authorization: `Bearer ${config.key}`, "Content-Type": "application/json" },
      body: JSON.stringify(clientSecretBody(config, keywords)),
    });
  } catch (error) {
    const timeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return unavailable(timeout ? "PROVIDER_TIMEOUT" : "PROVIDER_ERROR");
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    return unavailable(response.status >= 500 ? "PROVIDER_ERROR" : "PROVIDER_REJECTED", response.status);
  }
  let data: any;
  try {
    data = await response.json();
  } catch (error) {
    const timeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return unavailable(timeout ? "PROVIDER_TIMEOUT" : "PROVIDER_INVALID");
  }
  const value = data?.value;
  const expiresAt = data?.expires_at;
  // The secret goes into a WebSocket subprotocol, so it must be a plain token.
  if (typeof value !== "string" || !/^[\x21-\x7e]{1,4096}$/.test(value) || /[(),/:;<=>?@[\\\]{}"]/.test(value) || value === config.key)
    return unavailable("PROVIDER_INVALID");
  if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt) || expiresAt <= 0) return unavailable("PROVIDER_INVALID");
  return { available: true, clientSecret: value, expiresAt, wsUrl: config.wsUrl, model: config.model, transcription: transcriptionSettings(config, keywords) };
}

/** A short operator line with the reason and HTTP status only. */
function unavailable(reason: string, status?: number): LiveTranscriptionGrant {
  console.warn(`[live-transcription] unavailable: ${reason}${status ? ` (HTTP ${status})` : ""}`);
  return { available: false, reason };
}
