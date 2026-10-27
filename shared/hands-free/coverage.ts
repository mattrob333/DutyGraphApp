/**
 * The local "is this enough?" check for a hands-free card (docs/specs/COMPANION-HANDS-FREE.md §3).
 * Deterministic and forgiving: lower case, punctuation ignored, simple stems (orders/ordered/
 * ordering all match "order"), and multi-word cues matched as a run of words. The server check
 * (when the company has an approved AI connection) can only add hint ids; nudge text always comes
 * from the hint table, never from a model.
 */
import type { CoverageResult, QuestionHint, SkipReason } from "./types";

/** Lower case, curly quotes made straight, apostrophes dropped ("don't" → "dont"), words only. */
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/'/g, "")
    .split(/[^a-z0-9*@]+/)
    .filter(Boolean);
}

/** A light English stem so simple plurals and -ing/-ed forms meet: wait, waits, waiting, waited → wait. */
export function stem(word: string): string {
  let w = word;
  if (w.length <= 3) return w;
  if (w.endsWith("ies") && w.length > 4) w = w.slice(0, -3) + "y";
  else if (w.endsWith("ing") && w.length > 5) w = w.slice(0, -3);
  else if (w.endsWith("ed") && w.length > 4) w = w.slice(0, -2);
  else if (/((ss|x|z|ch|sh)es|oes)$/.test(w) && w.length > 3) w = w.slice(0, -2);
  else if (w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us") && w.length > 3) w = w.slice(0, -1);
  // stopped → stopp → stop, shipping → shipp → ship (but call, bill, pass stay).
  if (/([b-df-hj-km-np-rtv-z])\1$/.test(w) && !/(ll|ss|zz)$/.test(w)) w = w.slice(0, -1);
  // make / making / makes → mak.
  if (w.endsWith("e") && w.length > 3) w = w.slice(0, -1);
  return w;
}

const MONTHS_AND_DAYS = new Set(
  "january february march april may june july august september october november december monday tuesday wednesday thursday friday saturday sunday".split(" "),
);

/** Capitalised words that are not at the start of a sentence: names as the recognizer writes them. */
function hasName(text: string): boolean {
  for (const sentence of text.split(/[.!?;:]+/)) {
    const ws = sentence.trim().split(/\s+/).slice(1);
    for (const raw of ws) {
      const w = raw.replace(/[^A-Za-z']/g, "");
      if (/^[A-Z][a-z]{2,}$/.test(w) && !MONTHS_AND_DAYS.has(w.toLowerCase())) return true;
    }
  }
  return false;
}

type Matcher = (text: string, stems: string[]) => boolean;
const matcherCache = new Map<string, Matcher>();

/**
 * One cue as a matcher. A cue is a word or short phrase ("comes from", "same day"); a trailing `*`
 * on a word matches any word starting with it ("spreadsheet*"); `@name` matches a capitalised name
 * in the middle of a sentence (for "Who" chips).
 */
function matcher(cue: string): Matcher {
  const hit = matcherCache.get(cue);
  if (hit) return hit;
  let m: Matcher;
  if (cue.trim() === "@name") m = (text) => hasName(text);
  else {
    const parts: ({ prefix: string } | { stem: string })[] = words(cue).map((w) => (w.endsWith("*") ? { prefix: w.slice(0, -1) } : { stem: stem(w) }));
    m = (_text, stems) => {
      if (!parts.length) return false;
      outer: for (let i = 0; i + parts.length <= stems.length; i++) {
        for (let j = 0; j < parts.length; j++) {
          const p = parts[j];
          const s = stems[i + j];
          if ("prefix" in p ? !s.startsWith(stem(p.prefix)) && !s.startsWith(p.prefix) : s !== p.stem) continue outer;
        }
        return true;
      }
      return false;
    };
  }
  matcherCache.set(cue, m);
  return m;
}

/** True when any of the hint's cues appears in the text. */
export function heardHint(text: string, hint: QuestionHint): boolean {
  const stems = words(text).map(stem);
  return hint.cues.some((cue) => matcher(cue)(text, stems));
}

/** The first missing hint's nudge, or null when every hint is covered. */
export function nudgeFor(hints: readonly QuestionHint[], covered: readonly string[]): string | null {
  return hints.find((h) => !covered.includes(h.id))?.nudge ?? null;
}

/**
 * The local check. `already` are ids heard earlier on this card (chips never untick while the
 * person talks). The result keeps the hints' order.
 */
export function coverLocally(text: string, hints: readonly QuestionHint[], already: readonly string[] = []): CoverageResult {
  const stems = words(text).map(stem);
  const covered = hints
    .filter((h) => already.includes(h.id) || h.cues.some((cue) => matcher(cue)(text, stems)))
    .map((h) => h.id);
  return { covered, nudge: nudgeFor(hints, covered), source: "local" };
}

/**
 * Local and server results together. Server ids are filtered to the card's hints (the server
 * filters too; this keeps a stale or wrong id from ticking a chip), and order follows the hints.
 */
export function mergeCoverage(local: CoverageResult, serverIds: readonly string[] | null | undefined, hints?: readonly QuestionHint[]): CoverageResult {
  const ids = new Set([...local.covered, ...(serverIds || [])]);
  if (!hints) {
    const covered = [...local.covered, ...(serverIds || []).filter((id) => !local.covered.includes(id))];
    return { covered: [...new Set(covered)], nudge: local.nudge, source: serverIds?.length ? "server" : local.source };
  }
  const covered = hints.filter((h) => ids.has(h.id)).map((h) => h.id);
  const added = covered.some((id) => !local.covered.includes(id));
  return { covered, nudge: nudgeFor(hints, covered), source: added ? "server" : local.source };
}

/* ---------------------------------------------------------------- spoken skip */

const SKIP_PHRASES: [SkipReason, string][] = [
  ["dontknow", "i dont know yet"],
  ["dontknow", "i do not know yet"],
  ["dontknow", "dont know yet"],
  ["dontknow", "i dont know"],
  ["dontknow", "i do not know"],
  ["dontknow", "dont know"],
  ["dontknow", "not sure yet"],
  ["dontknow", "im not sure"],
  ["dontknow", "i am not sure"],
  ["dontknow", "i have no idea"],
  ["dontknow", "no idea"],
  ["dontknow", "no clue"],
  ["someone", "someone else should answer this"],
  ["someone", "someone else should answer"],
  ["someone", "somebody else should answer this"],
  ["someone", "somebody else should answer"],
  ["someone", "someone else would know"],
  ["someone", "somebody else would know"],
  ["someone", "ask someone else"],
  ["someone", "ask somebody else"],
  ["someone", "im not the right person"],
  ["someone", "not the right person"],
  ["someone", "not my area"],
  ["skip", "skip this one"],
  ["skip", "skip this question"],
  ["skip", "skip this"],
  ["skip", "skip that"],
  ["skip", "skip it"],
  ["skip", "lets skip"],
  ["skip", "next question"],
  ["skip", "move on"],
  ["skip", "pass on this one"],
  ["skip", "ill pass"],
];

/** Words people wrap around "I don't know yet" that do not change it. */
const FILLERS = new Set(
  "hmm hm hmmm mm um umm uh uhh er erm ah oh well honestly sorry really actually yeah yes no so okay ok just still though anyway please lets let".split(" "),
);
const FILLER_RUNS = ["to be honest", "right now", "at the moment", "for now", "i think", "i guess", "i mean", "you know", "to be fair"].map(words);

function dropFillerRuns(ws: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < ws.length; ) {
    const run = FILLER_RUNS.find((r) => r.every((w, j) => ws[i + j] === w));
    if (run) i += run.length;
    else out.push(ws[i++]);
  }
  return out.filter((w) => !FILLERS.has(w));
}

/** Most words a short aside after the skip may have ("It changes week to week."). */
const ASIDE_WORDS = 6;
/** Text this short (in words) with a skip phrase counts even with no punctuation from the recognizer. */
const SHORT_TEXT = 12;

/**
 * A spoken skip: "I don't know yet", "someone else should answer this", "skip this one". Only the
 * end of the answer counts, so "I don't know yet. Actually it goes to Priya…" is an answer, not a
 * skip. The skip must be its own sentence (give or take "hmm", "honestly"); one short aside after
 * it is fine ("I don't know yet, honestly. It changes week to week."). Without punctuation, a
 * short answer (12 words or fewer) that is mostly the skip also counts.
 */
export function spokenSkip(text: string): SkipReason | null {
  const sentences = text
    .split(/[.!?;]+/)
    .map(words)
    .filter((s) => s.length);
  if (!sentences.length) return null;
  const total = sentences.reduce((n, s) => n + s.length, 0);
  // Walk back from the last sentence; the asides after the skip sentence must stay short.
  let after = 0;
  for (let i = sentences.length - 1; i >= 0; i--) {
    const reason = skipSentence(sentences[i]);
    if (reason) return reason;
    after += sentences[i].length;
    if (after > ASIDE_WORDS) break;
  }
  if (total <= SHORT_TEXT) {
    const all = sentences.flat();
    for (const [reason, phrase] of SKIP_PHRASES) {
      const at = indexOfRun(all, words(phrase));
      if (at >= 0 && dropFillerRuns(all.slice(0, at)).length === 0) return reason;
    }
  }
  return null;
}

function skipSentence(sentence: string[]): SkipReason | null {
  for (const [reason, phrase] of SKIP_PHRASES) {
    const p = words(phrase);
    const at = indexOfRun(sentence, p);
    if (at < 0) continue;
    const rest = [...sentence.slice(0, at), ...sentence.slice(at + p.length)];
    if (dropFillerRuns(rest).length === 0) return reason;
  }
  return null;
}

function indexOfRun(ws: string[], run: string[]): number {
  outer: for (let i = 0; i + run.length <= ws.length; i++) {
    for (let j = 0; j < run.length; j++) if (ws[i + j] !== run[j]) continue outer;
    return i;
  }
  return -1;
}

/**
 * A skip the deck takes by itself after a pause (October 18): the whole answer, give or take "hmm" or
 * "honestly", is a skip phrase ("I don't know yet", "skip this one"). Anything more and the person is
 * still answering, so the card keeps listening; Next still reads a skip with `spokenSkip`.
 */
export function wholeSkip(text: string): SkipReason | null {
  const all = dropFillerRuns(words(text));
  if (!all.length) return null;
  for (const [reason, phrase] of SKIP_PHRASES) {
    const p = words(phrase);
    if (p.length === all.length && p.every((w, i) => all[i] === w)) return reason;
  }
  return null;
}
