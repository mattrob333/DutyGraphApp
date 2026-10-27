import test from "node:test";
import assert from "node:assert/strict";
import { coverLocally, mergeCoverage, nudgeFor, spokenSkip, stem } from "../shared/hands-free/coverage.ts";
import { hintsForQuestion } from "../shared/hands-free/hints.ts";
import type { QuestionHint } from "../shared/hands-free/types.ts";
import { HF_Q } from "./hands-free-fixtures.ts";

const hint = (id: string, cues: string[]): QuestionHint => ({ id, label: id, nudge: `…${id}?`, cues });

test("cue matching ignores case and punctuation and meets simple word forms", () => {
  const hints = [hint("wait", ["wait"]), hint("check", ["credit check"]), hint("ship", ["ship"]), hint("tools", ["spreadsheet*"])];
  assert.deepEqual(coverLocally("ORDERS WAITING!", hints).covered, ["wait"]);
  assert.deepEqual(coverLocally("it waited, then waits again", hints).covered, ["wait"]);
  assert.deepEqual(coverLocally("They need Credit-Checks.", hints).covered, ["check"]);
  assert.deepEqual(coverLocally("we shipped it", hints).covered, ["ship"]);
  assert.deepEqual(coverLocally("shipping", hints).covered, ["ship"]);
  assert.deepEqual(coverLocally("two spreadsheets", hints).covered, ["tools"]);
  assert.deepEqual(coverLocally("a credit card check", hints).covered, [], "a phrase must be a run of words");
  assert.equal(stem("approves"), stem("approved"));
  assert.equal(stem("goes"), stem("go"));
  assert.equal(stem("minutes"), stem("minute"));
  assert.equal(stem("calls"), "call");
});

test("contractions and curly apostrophes match", () => {
  assert.deepEqual(coverLocally("It isn’t ready", [hint("not", ["isnt"])]).covered, ["not"]);
  assert.deepEqual(coverLocally("It isn't ready", [hint("not", ["isn't"])]).covered, ["not"]);
});

test("@name matches a name in the middle of a sentence", () => {
  const who = [hint("who", ["@name"])];
  assert.deepEqual(coverLocally("Usually I ask Priya.", who).covered, ["who"]);
  assert.deepEqual(coverLocally("Usually I ask on Monday.", who).covered, []);
  assert.deepEqual(coverLocally("Usually I ask.", who).covered, []);
});

test("chips already heard stay heard, in hint order", () => {
  const hints = [hint("a", ["alpha"]), hint("b", ["beta"])];
  assert.deepEqual(coverLocally("beta", hints, ["a"]).covered, ["a", "b"]);
  assert.equal(coverLocally("beta", hints).nudge, "…a?");
  assert.equal(nudgeFor(hints, ["a"]), "…b?");
  assert.equal(nudgeFor(hints, ["a", "b"]), null);
});

test("the prototype's scripted utterances tick the right chip at the right sentence", () => {
  for (const p of HF_Q) {
    const { hints } = hintsForQuestion(p.q);
    let text = "";
    const expected = new Set<string>();
    for (const sentence of p.utt.flat()) {
      text = `${text} ${sentence[0]}`.trim();
      if (sentence[1] != null) expected.add(hints[sentence[1]].id);
      assert.deepEqual(coverLocally(text, hints).covered, hints.filter((h) => expected.has(h.id)).map((h) => h.id), `${p.short} after: ${sentence[0]}`);
    }
    // The nudge for the first missing chip is the prototype's.
    const firstAttempt = p.utt[0].map((s) => s[0]).join(" ");
    const missing = p.chips.findIndex((_, i) => !p.utt[0].some((s) => s[1] === i));
    assert.equal(coverLocally(firstAttempt, hints).nudge, missing < 0 ? null : p.nudges[missing], p.short);
  }
  const who = HF_Q[4];
  assert.deepEqual(coverLocally(who.full!, hintsForQuestion(who.q).hints).covered, ["h0", "h1"]);
});

test("spoken skips: the end of the answer only", () => {
  assert.equal(spokenSkip("Hmm. I don't know yet, honestly. It changes week to week."), "dontknow");
  assert.equal(spokenSkip("hmm i dont know yet honestly it changes week to week"), "dontknow");
  assert.equal(spokenSkip("I don’t know yet."), "dontknow");
  assert.equal(spokenSkip("Someone else should answer this."), "someone");
  assert.equal(spokenSkip("Honestly, somebody else would know. Ask Sam."), "someone");
  assert.equal(spokenSkip("Skip this one."), "skip");
  assert.equal(spokenSkip("Um, let's move on"), "skip");
  assert.equal(spokenSkip("I don't know yet. Actually it goes to Priya in the warehouse and then she sends it on to dispatch."), null);
  assert.equal(spokenSkip("I don't know yet who will take it over, but right now Sam does it and he sends it to Priya every Monday."), null);
  assert.equal(spokenSkip("Orders wait when they need a credit check, and I don't know why Finance takes so long."), null);
  assert.equal(spokenSkip("We skip this step when stock is short."), null);
  assert.equal(spokenSkip(""), null);
});

test("mergeCoverage adds server ids, filtered to the card's hints", () => {
  const hints = [hint("h0", ["a"]), hint("h1", ["b"]), hint("h2", ["c"])];
  const local = coverLocally("a", hints);
  const merged = mergeCoverage(local, ["h2", "zz"], hints);
  assert.deepEqual(merged.covered, ["h0", "h2"]);
  assert.equal(merged.source, "server");
  assert.equal(merged.nudge, "…h1?");
  assert.equal(mergeCoverage(local, null, hints).source, "local");
  assert.deepEqual(mergeCoverage(local, ["h1"]).covered, ["h0", "h1"]);
});
