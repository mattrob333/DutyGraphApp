/**
 * The recorded backup for spoken cards (October 19, docs/specs/COMPANION-HANDS-FREE.md §9): while a
 * card listens, the page also records it. When live words dropped out (no signal on a drive, a
 * recognizer the phone stopped), that recording is turned into text later and put into the answer
 * here. Pure, shared by the deck reducer and the review screen.
 */
import { coverLocally } from "./coverage";
import type { CardAnswer, HandsFreeQuestion, HandsFreeVoiceVia } from "./types";

const join = (a: string, b: string) => [a.trim(), b.trim()].filter(Boolean).join(" ");

/**
 * The answer's words with a recording's text in: it replaces the live words heard while that
 * recording ran (`replace`) when they are still there, unchanged; otherwise it goes where the
 * recording started (after `before`, the card's words when it started), or at the end.
 */
export function mergeRecorded(raw: string, replace: string, text: string, before?: string): string {
  const t = text.trim();
  if (!t) return raw;
  const r = replace.trim();
  if (r && raw.includes(r)) return raw.replace(r, t).trim();
  const b = before?.trim();
  if (b != null && raw.trim().startsWith(b)) return join(join(b, t), raw.trim().slice(b.length));
  return join(raw, t);
}

/**
 * A card's answer once its recording is text. A card the person skipped stays skipped; a card with
 * no answer yet (Next on "Anything else?" with nothing heard) gets one. The chips are checked again.
 */
export function applyRecorded(
  answer: CardAnswer | null,
  question: HandsFreeQuestion,
  replace: string,
  text: string,
  via: HandsFreeVoiceVia,
  before?: string,
): CardAnswer | null {
  if (answer?.status === "skipped" || !text.trim()) return answer;
  const raw = mergeRecorded(answer?.raw ?? "", replace, text, before);
  const covered = question.isElse ? [] : coverLocally(raw, question.hints, answer?.covered ?? []).covered;
  const status = question.isElse || question.hints.every((h) => covered.includes(h.id)) ? "got" : "saved";
  return { ...(answer ?? {}), status, raw, covered, input: { ...(answer?.input ?? {}), voice: via } };
}
