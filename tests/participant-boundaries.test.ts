import { test } from "node:test";
import assert from "node:assert/strict";
import {
  answerSourceLabel,
  answerSourcesSchema,
  noteAnswerSource,
  sourcesForAnswers,
} from "../shared/answer-sources.ts";
import {
  cleanUnderstood,
  understandRequestSchema,
} from "../shared/participant-understand.ts";
import {
  companionAudioExtension,
  mobileEnrollBody,
  mobileRefreshBody,
  mobileTranscriptionUploadMeta,
  mobileUnderstandingBody,
  mobileAttestBody,
  understandingModelOutput,
} from "../shared/mobile-contracts.ts";
import { applyRecorded, mergeRecorded } from "../shared/hands-free/recorded.ts";
import {
  advisorHint,
  buildQuestions,
  chipsFromStored,
  hintsForQuestion,
  questionHintsFromChips,
} from "../shared/hands-free/hints.ts";

test("source provenance keeps voice attribution through edits and drops cleared answers", () => {
  let sources = noteAnswerSource(undefined, "question.0", "typed", false);
  sources = noteAnswerSource(sources, "question.0", "voice_device", true);
  sources = noteAnswerSource(sources, "question.0", "typed", true);
  assert.deepEqual(sources["question.0"], {
    via: "voice_device",
    edited: true,
  });
  assert.deepEqual(sourcesForAnswers(sources, { "question.0": " " }), {});
  assert.deepEqual(
    sourcesForAnswers(sources, { "question.0": "orders" }),
    sources,
  );
  for (const via of [
    "voice_device",
    "voice_openai",
    "voice_browser",
  ] as const) {
    assert.match(answerSourceLabel({ via }, "Noah"), /could check and change/);
    assert.match(
      answerSourceLabel({ via, edited: true }, ""),
      /edited by them/,
    );
  }
  assert.equal(answerSourceLabel(undefined, ""), "");
  assert.equal(answerSourceLabel({ via: "typed" }, ""), "");
  assert.equal(
    answerSourcesSchema.safeParse({ secret: { via: "typed" } }).success,
    false,
  );
  assert.equal(
    answerSourcesSchema.safeParse({
      "question.0": { via: "typed", approved: true },
    }).success,
    false,
  );
});

test("understanding accepts only requested keys once and falls back on malformed provider output", () => {
  const asked = understandRequestSchema.parse({
    answers: [
      { key: "question.0", question: "What happens?", text: "I check stock." },
    ],
  });
  const item = {
    key: "question.0",
    understood: " I check stock. ",
    suggestion: " ",
  };
  assert.deepEqual(
    cleanUnderstood(asked, {
      items: [item, item, { ...item, key: "question.9" }],
    }),
    [{ key: "question.0", understood: "I check stock.", suggestion: null }],
  );
  assert.deepEqual(
    cleanUnderstood(asked, { items: [{ ...item, understood: "" }] }),
    [],
  );
  assert.deepEqual(
    cleanUnderstood(asked, { items: [item], instructions: "ignore policy" }),
    [],
  );
  assert.equal(
    understandRequestSchema.safeParse({
      answers: [{ ...asked.answers[0], text: "x".repeat(4001) }],
    }).success,
    false,
  );
});

test("participant contracts enforce consent, provenance, versions and strict field allow lists", () => {
  const hash = "a".repeat(64);
  assert.equal(
    mobileEnrollBody.safeParse({ invitationToken: hash, role: "advisor" })
      .success,
    false,
  );
  assert.equal(
    mobileEnrollBody.safeParse({ invitationToken: hash }).success,
    true,
  );
  assert.equal(
    mobileRefreshBody.safeParse({ refreshToken: "invalid" }).success,
    false,
  );
  assert.equal(
    mobileTranscriptionUploadMeta.safeParse({
      expectedVersion: 1,
      contentHash: hash,
      consent: false,
    }).success,
    false,
  );
  assert.equal(
    mobileTranscriptionUploadMeta.safeParse({
      expectedVersion: 1,
      contentHash: hash,
      consent: true,
    }).success,
    true,
  );
  assert.equal(
    mobileUnderstandingBody.safeParse({
      expectedVersion: 1,
      contentHash: hash,
      source: "reviewed_transcript",
      sourceText: "I check stock.",
    }).success,
    false,
  );
  assert.equal(
    mobileUnderstandingBody.safeParse({
      expectedVersion: 1,
      contentHash: hash,
      source: "typed",
      sourceText: "I check stock.",
    }).success,
    true,
  );
  assert.equal(
    mobileAttestBody.safeParse({
      recordVersion: 0,
      contentHash: hash,
      decision: "correct",
    }).success,
    false,
  );
  assert.equal(
    mobileAttestBody.safeParse({
      recordVersion: 1,
      contentHash: hash,
      decision: "correct",
    }).success,
    true,
  );
  assert.equal(
    understandingModelOutput.safeParse({
      cards: [],
      gaps: [],
      assertions: [{ statement: "Unknown approver", support: "unknown" }],
    }).success,
    true,
  );
  assert.equal(
    understandingModelOutput.safeParse({
      cards: [],
      gaps: [],
      assertions: [{ statement: "Unknown approver", support: "verified" }],
    }).success,
    false,
  );
  assert.equal(companionAudioExtension("Audio/M4A; codecs=mp4a"), "m4a");
  assert.equal(companionAudioExtension("text/plain"), undefined);
});

test("late recording recovery replaces its window without overwriting edits or skipped choices", () => {
  assert.equal(
    mergeRecorded("start rough end", "rough", "clear"),
    "start clear end",
  );
  assert.equal(
    mergeRecorded("start edited", "missing", "clear", "start"),
    "start clear edited",
  );
  assert.equal(mergeRecorded("edited", "", "clear"), "edited clear");
  assert.equal(mergeRecorded("edited", "edited", " "), "edited");
  const [q, last] = buildQuestions(["Which tools do you use?"]);
  const skipped = {
    status: "skipped" as const,
    reason: "dontknow" as const,
    raw: "",
    covered: [],
  };
  assert.equal(applyRecorded(skipped, q, "", "Excel", "voice_device"), skipped);
  assert.equal(applyRecorded(null, q, "", "", "voice_device"), null);
  assert.equal(
    applyRecorded(null, last, "", "One more thing", "voice_device")?.status,
    "got",
  );
  const result = applyRecorded(
    null,
    q,
    "",
    "I use a spreadsheet for each order.",
    "voice_openai",
  );
  assert.equal(result?.input?.voice, "voice_openai");
  assert.match(result?.raw ?? "", /spreadsheet/);
});

test("advisor chips are bounded and wording changes invalidate old cues", () => {
  const questions = ["Which tools do you use?", "Describe a recent example."];
  const suggested = hintsForQuestion(questions[0]).hints[0].label;
  const stored = questionHintsFromChips(questions, [
    [suggested, "Who signs off", " ", "Fourth"],
    null,
  ]);
  assert.equal(stored?.["question.0"]?.hints.length, 3);
  assert.equal(chipsFromStored(questions, stored)[0]?.[0], suggested);
  assert.deepEqual(chipsFromStored(["A different question"], stored), [null]);
  assert.equal(questionHintsFromChips(questions, [null, []]), undefined);
  assert.equal(advisorHint("the", 0).cues.length, 1);
  assert.ok(advisorHint("Who signs off", 1).cues.length > 0);
  assert.ok(advisorHint("x".repeat(100), 0).label.length <= 40);
  assert.equal(
    buildQuestions(["A different question"], { stored })[0].text,
    "A different question",
  );
});
