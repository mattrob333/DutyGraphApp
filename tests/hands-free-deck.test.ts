import test from "node:test";
import assert from "node:assert/strict";
import {
  createDeck,
  DECK_TIMING,
  deckEffects,
  deckMic,
  deckReducer,
  deckServerCheck,
  deckReady,
  deckText,
  progressLabel,
  progressSegments,
  type DeckEvent,
  type DeckState,
  type DeckTimerKind,
} from "../shared/hands-free/deck.ts";
import { buildQuestions } from "../shared/hands-free/hints.ts";
import { toSubmission } from "../shared/hands-free/submission.ts";
import { ADVISOR, HF_ELSE_SAY, HF_Q } from "./hands-free-fixtures.ts";

const questions = () => buildQuestions(HF_Q.map((p) => p.q), { advisorName: ADVISOR });

/** A tiny harness: the UI hook's job, without React. Collects every announcement. */
class Run {
  s: DeckState;
  said: string[] = [];
  constructor(s: DeckState) {
    this.s = s;
    this.said.push(s.announce);
  }
  send(e: DeckEvent) {
    const before = this.s.announceId;
    this.s = deckReducer(this.s, e);
    if (this.s.announceId !== before) this.said.push(this.s.announce);
    return this;
  }
  /** The pending timer (a call, so an earlier assert does not narrow it). */
  t() {
    return this.s.timer;
  }
  /** Fires the scheduled timer, checking it is the expected kind and length. */
  fire(kind: DeckTimerKind, ms?: number) {
    const t = this.s.timer;
    assert.ok(t, `expected a ${kind} timer, phase ${this.s.phase}`);
    assert.equal(t.kind, kind, `timer kind in phase ${this.s.phase}`);
    if (ms != null) assert.equal(t.ms, ms, `${kind} ms`);
    return this.send({ type: "timer", id: t.id });
  }
  /** The recognizer: full text since the session started, like the live speech interface. */
  say(text: string) {
    const mic = deckMic(this.s);
    assert.ok(mic.on, `mic should be on to speak (phase ${this.s.phase})`);
    return this.send({ type: "speech", session: mic.session, text });
  }
  /** Speaks one scripted attempt sentence by sentence (the prototype's tick, a sentence at a time). */
  speakAttempt(qi: number, attempt: number) {
    let text = "";
    for (const [sentence] of HF_Q[qi].utt[attempt]) {
      text = `${text} ${sentence}`.trim();
      this.say(text);
    }
    return this;
  }
}

test("a full voice run of 6 cards: chips light, Next ends each card (no auto-advance, October 18)", () => {
  const r = new Run(createDeck(questions()));
  assert.equal(r.s.phase, "ready");
  assert.equal(r.s.total, 6);
  assert.equal(r.s.announce, `Question 1 of 6. ${HF_Q[0].q}`);
  assert.equal(deckMic(r.s).on, false);
  assert.equal(progressLabel(r.s), "Question 1 of 6");

  // Card 1: two chips, the nudge, then the last chip.
  r.fire("listen", DECK_TIMING.cardToListen);
  assert.equal(r.s.phase, "listening");
  assert.deepEqual(deckMic(r.s), { on: true, session: r.s.session, script: { questionIndex: 0, attempt: 0 } });
  assert.equal(r.t()?.kind, "silence");
  assert.equal(r.t()?.ms, DECK_TIMING.silenceToCheck);
  r.say("Most orders come in");
  assert.deepEqual(r.s.covered, ["h0"]);
  assert.equal(r.s.announce, "Heard: Where it comes from");
  r.speakAttempt(0, 0);
  assert.deepEqual(r.s.covered, ["h0", "h1"]);
  assert.equal(r.s.announce, "Heard: What you do first");
  r.fire("pause", DECK_TIMING.pauseToCheck);
  assert.equal(r.s.phase, "checking");
  assert.equal(r.s.announce, "Checking");
  r.fire("check", DECK_TIMING.checkingMin);
  assert.equal(r.s.phase, "more");
  assert.equal(r.s.nudges, 1);
  assert.equal(r.s.nudgeHint, "h2");
  assert.equal(r.s.announce, "…and who picks it up after you?");
  assert.equal(deckMic(r.s).on, true, "the microphone stays open during a nudge");
  const firstSession = r.s.session;
  r.fire("listen", DECK_TIMING.moreToListen);
  assert.equal(r.s.phase, "listening");
  assert.ok(r.s.session > firstSession, "a new attempt is a new microphone session");
  assert.deepEqual(deckMic(r.s).script, { questionIndex: 0, attempt: 1 });
  r.speakAttempt(0, 1);
  assert.deepEqual(r.s.covered, ["h0", "h1", "h2"]);
  assert.equal(deckText(r.s), HF_Q[0].utt.flat().map((s) => s[0]).join(" "));
  assert.equal(r.s.announce, "That covers it. Tap Next when you're ready.");
  assert.equal(deckReady(r.s), true, "every chip heard: Next lights up");
  r.fire("pause").fire("check");
  assert.equal(r.s.phase, "listening", "a pause never ends a spoken card");
  assert.equal(r.s.timer, null);
  assert.equal(deckMic(r.s).on, true, "the microphone stays on until Next");
  r.send({ type: "next" });
  assert.equal(r.s.phase, "got");
  assert.equal(r.s.announce, "Question 1 of 6, got it.");
  assert.equal(deckMic(r.s).on, false);
  assert.equal(r.s.answers[0]?.status, "got");
  assert.equal(r.s.answers[0]?.raw, deckText(r.s));
  r.fire("advance", DECK_TIMING.gotHold);

  // Card 2: covered, then Keep talking undoes the advance, then it ends again.
  assert.equal(r.s.idx, 1);
  assert.equal(r.s.announce, `Question 2 of 6. ${HF_Q[1].q}`);
  r.fire("listen").speakAttempt(1, 0).fire("pause").fire("check");
  assert.equal(r.s.phase, "listening");
  r.send({ type: "next" });
  assert.equal(r.s.phase, "got");
  r.send({ type: "keepTalking" });
  assert.equal(r.s.phase, "listening");
  assert.equal(r.s.answers[1], null);
  assert.equal(r.s.announce, "Listening again");
  assert.equal(deckMic(r.s).on, true);
  r.say("And Teams for anything urgent.");
  assert.match(deckText(r.s), /Excel to track anything on hold\. And Teams for anything urgent\.$/);
  r.fire("pause").fire("check").send({ type: "next" });
  assert.equal(r.s.phase, "got");
  assert.match(r.s.answers[1]!.raw, /Teams for anything urgent/);
  r.fire("advance");

  // Card 3: all three chips in one go.
  r.fire("listen").speakAttempt(2, 0).fire("pause").fire("check").send({ type: "next" });
  assert.equal(r.s.phase, "got");
  assert.deepEqual(r.s.answers[2]?.covered, ["h0", "h1", "h2"]);
  r.fire("advance");

  // Card 4.
  r.fire("listen").speakAttempt(3, 0).fire("pause").fire("check").send({ type: "next" }).fire("advance");

  // Card 5: "I don't know yet" with an aside is not the whole answer, so the card keeps listening;
  // Next reads the skip.
  assert.equal(r.s.idx, 4);
  r.fire("listen").speakAttempt(4, 0).fire("pause").fire("check");
  assert.notEqual(r.s.phase, "skipped", "a pause never skips mid-answer");
  r.send({ type: "next" });
  assert.equal(r.s.phase, "skipped");
  assert.deepEqual(r.s.answers[4], { status: "skipped", raw: HF_Q[4].utt[0][0][0], covered: [], reason: "dontknow", input: { voice: "voice_browser" } });
  assert.equal(r.s.announce, "Question 5 of 6, you don't know yet.");
  r.fire("advance", DECK_TIMING.skippedHold);

  // Card 6: only the first chip, then silence: 2 nudges, then it keeps listening until Next (Saved).
  r.fire("listen");
  r.say(HF_Q[5].utt[0][0][0]);
  r.fire("pause").fire("check");
  assert.equal(r.s.phase, "more");
  assert.equal(r.s.announce, "…and what would that save you?");
  r.fire("listen").fire("silence", DECK_TIMING.silenceToCheck).fire("check");
  assert.equal(r.s.phase, "more");
  assert.equal(r.s.nudges, 2);
  r.fire("listen").fire("silence").fire("check");
  assert.equal(r.s.phase, "listening", "after the nudges it waits; it never saves by itself");
  assert.equal(deckReady(r.s), false, "Next stays quiet: a chip is missing");
  r.send({ type: "next" });
  assert.equal(r.s.phase, "saved");
  assert.equal(r.s.announce, "Question 6 of 6, saved.");
  assert.deepEqual(r.s.answers[5], { status: "saved", raw: HF_Q[5].utt[0][0][0], covered: ["h0"], input: { voice: "voice_browser" } });
  r.fire("advance", DECK_TIMING.savedHold);

  // Anything else?
  assert.equal(r.s.idx, 6);
  assert.equal(r.s.announce, `One last thing. Anything else Alex should know about your work?`);
  assert.equal(progressLabel(r.s), "One last thing");
  r.fire("listen");
  assert.equal(r.t()?.ms, DECK_TIMING.elseSilence);
  r.say(HF_ELSE_SAY).fire("pause");
  assert.equal(r.s.phase, "listening", "Anything else? waits for Next");
  assert.equal(deckReady(r.s), true);
  r.send({ type: "next" });
  assert.equal(r.s.phase, "got");
  assert.equal(r.s.announce, "Got it.");
  r.fire("advance");
  assert.equal(r.s.phase, "done");
  assert.equal(r.s.announce, "Here's what we heard. Check it, then tap Send.");
  assert.equal(deckEffects(r.s).timer, null);
  assert.equal(deckEffects(r.s).mic.on, false);
  assert.deepEqual(progressSegments(r.s), ["got", "got", "got", "got", "skipped", "saved"]);

  // The answers go straight into a submission.
  const sub = toSubmission(r.s.questions, r.s.answers);
  assert.deepEqual(sub.questionResponses, { "question.4": "unknown" });
  assert.equal(sub.responseText, HF_ELSE_SAY);
  assert.equal(Object.keys(sub.questionAnswers || {}).length, 5);
  assert.ok(r.said.includes("That covers it. Tap Next when you're ready."));
});

test("stale timers and words from an old microphone session are ignored", () => {
  const r = new Run(createDeck(questions()));
  const old = r.s.timer!.id;
  r.fire("listen");
  const s1 = r.s;
  assert.equal(deckReducer(s1, { type: "timer", id: old }), s1);
  const oldSession = s1.session;
  r.send({ type: "pause" }).send({ type: "resume" });
  assert.ok(r.s.session > oldSession);
  const s2 = r.s;
  assert.equal(deckReducer(s2, { type: "speech", session: oldSession, text: "late words" }), s2);
});

test("nothing said on a card: it keeps listening, never checks an empty answer", () => {
  const r = new Run(createDeck(questions()));
  r.fire("listen").fire("silence");
  assert.equal(r.s.phase, "listening");
  assert.equal(r.s.timer, null);
  assert.equal(deckMic(r.s).on, true);
  r.say("Mostly by email.");
  assert.equal(r.t()?.kind, "pause");
});

test("talking again while Checking goes back to listening", () => {
  const r = new Run(createDeck(questions()));
  r.fire("listen").say("Most orders come in through the portal.").fire("pause");
  assert.equal(r.s.phase, "checking");
  r.say("Most orders come in through the portal. First I check stock.");
  assert.equal(r.s.phase, "listening");
  assert.equal(r.t()?.kind, "pause");
});

test("pause and resume", () => {
  const r = new Run(createDeck(questions()));
  r.fire("listen").say("Most orders come in");
  r.send({ type: "pause" });
  assert.equal(r.s.paused, true);
  assert.equal(r.s.announce, "Paused. Microphone off.");
  assert.equal(r.s.timer, null);
  assert.equal(deckMic(r.s).on, false);
  assert.equal(deckText(r.s), "Most orders come in", "words are kept");
  r.send({ type: "resume" });
  assert.equal(r.s.announce, "Listening again");
  assert.equal(r.t()?.kind, "silence");
  assert.equal(r.t()?.ms, DECK_TIMING.resumeSilence);
  r.say("through the customer portal.");
  assert.equal(deckText(r.s), "Most orders come in through the customer portal.");

  // Paused during a hold: it advances 900 ms after resuming.
  r.say("through the customer portal. First I check stock. Then it goes to the warehouse team.").fire("pause").fire("check").send({ type: "next" });
  assert.equal(r.s.phase, "got");
  r.send({ type: "pause" }).send({ type: "resume" });
  r.fire("advance", DECK_TIMING.resumeHold);
  assert.equal(r.s.idx, 1);

  // Paused while ready.
  r.send({ type: "pause" }).send({ type: "resume" });
  r.fire("listen", DECK_TIMING.resumeToListen);
  assert.equal(r.s.phase, "listening");
});

test("going back shows what was said; Add more reopens that card and returns", () => {
  const r = new Run(createDeck(questions()));
  for (const qi of [0, 1, 2]) {
    r.fire("listen");
    for (let a = 0; a < HF_Q[qi].utt.length; a++) {
      r.speakAttempt(qi, a).fire("pause").fire("check");
      if (r.s.phase === "more") r.fire("listen");
    }
    r.send({ type: "next" }).fire("advance");
  }
  assert.equal(r.s.idx, 3);
  r.fire("listen").say("I check the delivery address");
  r.send({ type: "prev" });
  assert.equal(r.s.view, 2);
  assert.equal(r.s.timer, null);
  assert.equal(deckMic(r.s).on, false);
  assert.equal(r.s.announce, `Question 3. ${HF_Q[2].q} You said: ${r.s.answers[2]!.raw}`);
  assert.equal(progressLabel(r.s), "Question 3 of 6");
  r.send({ type: "prev" });
  assert.equal(r.s.view, 1);
  r.send({ type: "fwd" });
  assert.equal(r.s.view, 2);
  r.send({ type: "fwd" });
  assert.equal(r.s.view, null);
  assert.equal(r.s.announce, "Back to question 4");
  assert.equal(r.t()?.kind, "silence");
  assert.equal(deckMic(r.s).on, true);

  r.send({ type: "prev" }).send({ type: "prev" });
  assert.equal(r.s.view, 1);
  const before = r.s.answers[1]!.raw;
  r.send({ type: "addMore" });
  assert.equal(r.s.idx, 1);
  assert.equal(r.s.view, null);
  assert.equal(r.s.phase, "listening");
  assert.equal(r.s.answers[1], null);
  assert.equal(r.s.announce, "Question 2, listening. Add whatever you like.");
  assert.equal(deckMic(r.s).script, null, "free talk, no script");
  assert.equal(deckText(r.s), before);
  r.say("And Teams for urgent ones.").fire("pause").fire("check").send({ type: "next" });
  assert.equal(r.s.phase, "got");
  assert.equal(r.s.answers[1]!.raw, `${before} And Teams for urgent ones.`);
  r.fire("advance");
  assert.equal(r.s.idx, 3, "back to the first unanswered card");
  assert.equal(deckText(r.s), "I check the delivery address", "words said there before are kept");
  assert.deepEqual(r.s.covered, ["h0"]);
});

test("typing mode: no auto-advance until Next", () => {
  const r = new Run(createDeck(questions(), { mode: "text" }));
  assert.equal(r.s.mode, "text");
  assert.equal(r.s.timer, null);
  r.send({ type: "typed", text: "Mostly the order system, plus Outlook and one Excel sheet." });
  assert.equal(r.s.phase, "listening");
  assert.equal(r.s.idx, 0);
  // Card 1 asks where orders come from; the typed words name no source yet.
  r.send({ type: "next" });
  assert.equal(r.s.phase, "more");
  assert.equal(r.s.timer, null, "no timer in typing mode");
  r.send({ type: "typed", text: "Most orders come in through the portal. First I check stock. Then it goes to the warehouse team." });
  r.send({ type: "next" });
  assert.equal(r.s.phase, "got");
  r.fire("advance");
  assert.equal(r.s.idx, 1);
  assert.equal(r.s.phase, "ready");
  assert.equal(r.s.timer, null);
  assert.equal(deckMic(r.s).on, false);
});

test("switching between voice and typing keeps the words", () => {
  const r = new Run(createDeck(questions()));
  r.fire("listen").say("Most orders come in through the portal.");
  r.send({ type: "toText" });
  assert.equal(r.s.mode, "text");
  assert.equal(r.s.typed, "Most orders come in through the portal.");
  assert.equal(r.s.announce, "Typing. Tap Next when you are done.");
  assert.equal(deckMic(r.s).on, false);
  r.send({ type: "typed", text: `${r.s.typed} First I check stock.` });
  r.send({ type: "toVoice" });
  assert.equal(r.s.mode, "voice");
  assert.equal(r.s.phase, "listening");
  assert.equal(deckMic(r.s).on, true);
  assert.equal(deckText(r.s), "Most orders come in through the portal. First I check stock.");
  assert.deepEqual(r.s.covered, ["h0", "h1"]);
});

test("skip sheet", () => {
  const r = new Run(createDeck(questions()));
  r.fire("listen");
  r.send({ type: "openSkip" });
  assert.equal(r.s.sheet, true);
  assert.equal(deckMic(r.s).on, false);
  assert.equal(r.s.timer, null);
  r.send({ type: "closeSkip" });
  assert.equal(r.s.sheet, false);
  assert.equal(deckMic(r.s).on, true);
  r.send({ type: "openSkip" }).send({ type: "skip", reason: "someone" });
  assert.equal(r.s.phase, "skipped");
  assert.equal(r.s.answers[0]?.reason, "someone");
  assert.equal(r.s.announce, "Question 1 of 6, someone else should answer.");
  r.fire("advance", DECK_TIMING.skippedHold);
  assert.equal(r.s.idx, 1);
});

test("speech error: Try again, or the microphone is blocked", () => {
  const r = new Run(createDeck(questions()));
  r.fire("listen").say("Most orders");
  r.send({ type: "speechError", code: "network", session: r.s.session });
  assert.equal(r.s.speechError, true);
  assert.equal(r.s.announce, "We couldn't hear that. Try again or type instead.");
  assert.equal(deckMic(r.s).on, false);
  assert.equal(r.s.timer, null);
  r.send({ type: "retry" });
  assert.equal(r.s.speechError, false);
  assert.equal(r.s.phase, "listening");
  assert.equal(deckMic(r.s).on, true);
  assert.equal(deckText(r.s), "Most orders");

  r.send({ type: "speechError", code: "permission_denied" });
  assert.equal(r.s.mode, "text");
  assert.equal(r.s.micBlocked, true);
  assert.equal(r.s.typed, "Most orders");
  assert.equal(r.s.announce, "Microphone blocked. You can type instead.");
  r.send({ type: "toVoice" });
  assert.equal(r.s.mode, "text");
  assert.equal(r.s.announce, "Microphone is blocked. Keep typing, or allow the microphone in your phone settings.");

  const blocked = createDeck(questions(), { micBlocked: true });
  assert.equal(blocked.mode, "text");
  assert.equal(blocked.timer, null);
});

test("offline: a flag and a notice; the local check carries on", () => {
  const r = new Run(createDeck(questions(), { serverCheck: true }));
  r.send({ type: "online", online: false });
  assert.equal(r.s.offline, true);
  assert.equal(r.s.announce, "You're offline. Your answers are saved on this phone and will be sent when you're back online.");
  r.fire("listen").say("Most orders come in through the portal.").fire("pause");
  assert.equal(deckServerCheck(r.s), null, "no server check while offline");
  r.fire("check");
  assert.equal(r.s.phase, "more");
  r.send({ type: "online", online: true });
  assert.equal(r.s.offline, false);
  assert.equal(r.s.announce, "You're back online.");
});

test("server check: adds hint ids, waits at most 2.5 s", () => {
  const r = new Run(createDeck(questions(), { serverCheck: true }));
  r.fire("listen").say("Orders come in through the portal and I key them in.").fire("pause");
  const check = deckServerCheck(r.s);
  assert.ok(check);
  assert.equal(check.questionKey, "question.0");
  assert.equal(check.text, "Orders come in through the portal and I key them in.");
  r.send({ type: "serverCoverage", checkId: check.checkId, covered: ["h1", "h2", "bogus"] });
  assert.deepEqual(r.s.covered, ["h0", "h1", "h2"]);
  assert.equal(r.s.phase, "checking", "Checking still shows its minimum time");
  r.fire("check");
  assert.equal(r.s.phase, "listening", "covered by the server: Next lights up, the card waits");
  assert.equal(deckReady(r.s), true);
  r.send({ type: "next" });
  assert.equal(r.s.phase, "got");
  r.fire("advance");

  // The server never answers: the local result stands after 2.5 s in all.
  r.fire("listen").say("Mostly the order system.").fire("pause").fire("check");
  assert.equal(r.s.phase, "checking");
  r.fire("serverWait", DECK_TIMING.serverWaitMax - DECK_TIMING.checkingMin);
  assert.equal(r.s.phase, "more");

  // A late answer for an old check changes nothing.
  const s = r.s;
  assert.equal(deckReducer(s, { type: "serverCoverage", checkId: check.checkId, covered: ["h1"] }), s);
});

test("a late server answer never ends a spoken card (October 21)", () => {
  const r = new Run(createDeck(questions(), { serverCheck: true }));
  const all = r.s.questions[0].hints.map((h) => h.id);
  // The server answers after Checking's minimum: every chip covered, the card keeps listening.
  r.fire("listen").say("Orders come in through the portal and").fire("pause");
  let check = deckServerCheck(r.s);
  assert.ok(check);
  r.fire("check");
  assert.equal(r.s.check?.minDone, true);
  r.send({ type: "serverCoverage", checkId: check.checkId, covered: all });
  assert.equal(r.s.phase, "listening", "a late answer does not end the card");
  assert.equal(r.s.answers[0], null);
  assert.equal(r.s.timer, null, "no advance timer");
  assert.equal(deckMic(r.s).on, true);

  // Nothing covered and late answers each time: nudges, then it waits for Next.
  const q = new Run(createDeck(questions(), { serverCheck: true }));
  q.fire("listen");
  for (let i = 0; i < 4; i++) {
    q.say(`Mostly the order system ${i}.`).fire("pause");
    check = deckServerCheck(q.s);
    assert.ok(check);
    q.fire("check").send({ type: "serverCoverage", checkId: check.checkId, covered: [] });
    assert.notEqual(q.s.phase, "got");
    assert.notEqual(q.s.phase, "saved");
    assert.equal(q.s.answers[0], null, `pause ${i + 1}: the card stays open`);
    if (q.s.phase === "more") q.fire("listen");
  }
  assert.equal(q.s.phase, "listening");
  q.send({ type: "next" });
  assert.equal(q.s.phase, "saved");
});

test("a server answer while paused, on a past card or with the skip sheet open waits for the person", () => {
  for (const interrupt of ["pause", "prev", "openSkip"] as const) {
    const r = new Run(createDeck(questions(), { serverCheck: true }));
    // Card 1 answered, so "prev" has a past card to show.
    r.fire("listen").send({ type: "skip", reason: "skip" }).fire("advance");
    assert.equal(r.s.idx, 1);
    r.fire("listen").say("Mostly the order system.").fire("pause");
    const check = deckServerCheck(r.s);
    assert.ok(check);
    r.fire("check");
    assert.equal(r.s.check?.minDone, true, "Checking minimum shown, waiting for the server");
    r.send({ type: interrupt });
    assert.equal(deckServerCheck(r.s), null, `${interrupt}: the in-flight check is no longer wanted`);
    r.send({ type: "serverCoverage", checkId: check.checkId, covered: null });
    assert.equal(r.s.phase, "checking", `${interrupt}: the card does not move on`);
    assert.equal(r.s.timer, null, `${interrupt}: no timer runs`);
    assert.equal(deckMic(r.s).on, false, `${interrupt}: the microphone stays off`);
    // Resuming checks again from the local result.
    r.send({ type: interrupt === "pause" ? "resume" : interrupt === "prev" ? "return" : "closeSkip" });
    r.fire("check", DECK_TIMING.resumeCheck);
    assert.equal(r.s.phase, "more");
  }
});

test("Add more from an Add-more card comes back to every card left", () => {
  const r = new Run(createDeck(questions(), { mode: "text" }));
  /** A call, so TypeScript does not narrow the phase between loops. */
  const more = () => r.s.phase === "more";
  for (const qi of [0, 1, 2]) {
    r.send({ type: "typed", text: `Answer ${qi}.` }).send({ type: "next" });
    while (more()) r.send({ type: "next" });
    r.fire("advance");
  }
  assert.equal(r.s.idx, 3);
  r.send({ type: "typed", text: "Words on card four." });
  r.send({ type: "prev" }).send({ type: "prev" }).send({ type: "addMore" });
  assert.equal(r.s.idx, 1);
  r.send({ type: "typed", text: "Answer 1. Added on two." });
  r.send({ type: "prev" }).send({ type: "addMore" });
  assert.equal(r.s.idx, 0);
  assert.equal(r.s.resumeTo, 1);
  r.send({ type: "next" });
  while (more()) r.send({ type: "next" });
  r.fire("advance");
  assert.equal(r.s.idx, 1, "back to the card Add more was first used on");
  assert.equal(deckText(r.s), "Answer 1. Added on two.", "its added words are kept");
  r.send({ type: "next" });
  while (more()) r.send({ type: "next" });
  r.fire("advance");
  assert.equal(r.s.idx, 3, "then the card the person was on");
  assert.equal(deckText(r.s), "Words on card four.");
  assert.deepEqual(r.s.answers.slice(0, 3).map((a) => a?.raw), ["Answer 0.", "Answer 1. Added on two.", "Answer 2."]);
});

test("Anything else: it waits for Next or No, that's all, also after silence (October 18)", () => {
  const answers = HF_Q.map(() => ({ status: "got" as const, raw: "words", covered: [] }));
  const r = new Run(createDeck(questions(), { answers }));
  assert.equal(r.s.idx, 6);
  r.fire("listen").fire("silence", DECK_TIMING.elseSilence);
  assert.equal(r.s.phase, "listening", "silence does not finish the deck");
  assert.equal(deckMic(r.s).on, true);
  assert.equal(r.s.timer, null);
  assert.equal(deckReady(r.s), false, "nothing said yet: Next is quiet");
  r.send({ type: "next" });
  assert.equal(r.s.phase, "done", "Next with nothing said goes to the review");

  const r2 = new Run(createDeck(questions(), { answers }));
  r2.fire("listen").send({ type: "finish" });
  assert.equal(r2.s.phase, "done");

  const r3 = new Run(createDeck(questions()));
  r3.send({ type: "finish" });
  assert.equal(r3.s.phase, "ready", "finish only ends the Anything else card");

  const all = createDeck(questions(), { answers: [...answers, { status: "got", raw: "x", covered: [] }] });
  assert.equal(all.phase, "done");
});

test("a draft resumes at the first unanswered card", () => {
  const draft = [{ status: "got" as const, raw: "Portal.", covered: ["h0"] }, null, { status: "skipped" as const, raw: "", covered: [], reason: "skip" as const }];
  const s = createDeck(questions(), { answers: draft });
  assert.equal(s.idx, 1);
  assert.equal(s.announce, `Question 2 of 6. ${HF_Q[1].q}`);
  assert.deepEqual(progressSegments(s), ["got", "current", "skipped", "todo", "todo", "todo"]);
});

test("typing mode: one nudge, then Next moves on with what was typed (saved)", () => {
  const r = new Run(createDeck(questions(), { mode: "text" }));
  r.send({ type: "typed", text: "Mostly the order system, plus Outlook and one Excel sheet." });
  r.send({ type: "next" });
  assert.equal(r.s.phase, "more", "the first Next nudges for the missing chip");
  assert.equal(r.s.nudges, 1);
  r.send({ type: "next" });
  assert.equal(r.s.phase, "saved", "the second Next moves on: a typed card nudges once");
  assert.equal(r.s.answers[0]?.status, "saved");
  assert.equal(r.s.answers[0]?.raw, "Mostly the order system, plus Outlook and one Excel sheet.");
  r.fire("advance");
  assert.equal(r.s.idx, 1);
});

test("each answer records where its words came from", () => {
  // Card 1 spoken through OpenAI, card 2 spoken then corrected by typing, card 3 typed only.
  const r = new Run(createDeck(questions()));
  r.fire("listen");
  r.send({ type: "speech", session: deckMic(r.s).session, text: "Orders come in through the portal.", via: "voice_openai" });
  assert.deepEqual(r.s.input, { voice: "voice_openai" });
  r.send({ type: "skip", reason: "skip" });
  assert.deepEqual(r.s.answers[0]?.input, { voice: "voice_openai" }, "a skip with words keeps where they came from");
  r.fire("advance");
  assert.deepEqual(r.s.input, {}, "a new card starts with no input");
  r.fire("listen").say("I check the stock.");
  assert.deepEqual(r.s.input, { voice: "voice_browser" }, "speech without a service named is the browser's captions");
  r.send({ type: "toText" });
  assert.deepEqual(r.s.input, { voice: "voice_browser" }, "switching to typing alone is not typing");
  r.send({ type: "typed", text: `${r.s.typed} Then the warehouse picks it.` });
  assert.deepEqual(r.s.input, { voice: "voice_browser", typed: true });
  r.send({ type: "skip", reason: "skip" });
  assert.deepEqual(r.s.answers[1]?.input, { voice: "voice_browser", typed: true });
  r.fire("advance");
  r.send({ type: "typed", text: "Only typed." });
  r.send({ type: "skip", reason: "skip" });
  assert.deepEqual(r.s.answers[2]?.input, { typed: true });
});

test("a spoken card never moves on by itself: nudges, then it waits for Next (October 18)", () => {
  const r = new Run(createDeck(questions()));
  r.fire("listen").say("Most orders come in through the portal").fire("pause").fire("check");
  assert.equal(r.s.phase, "more", "a missing chip still gets a nudge");
  r.fire("listen").fire("silence").fire("check");
  assert.equal(r.s.nudges, 2);
  r.fire("listen").fire("silence").fire("check");
  assert.equal(r.s.phase, "listening", "after the nudges: still listening");
  assert.equal(r.s.timer, null, "no timer is left to end the card");
  assert.equal(r.s.answers[0], null);
  // More silence changes nothing until the person speaks or taps Next.
  r.say("Most orders come in through the portal and then I key them in").fire("pause").fire("check");
  assert.notEqual(r.s.phase, "got");
  assert.notEqual(r.s.phase, "saved");
});

test("Next lights up once every chip is heard; Next ends Got it, or Saved with chips missing", () => {
  const r = new Run(createDeck(questions()));
  r.fire("listen").say("Most orders come in through the portal.");
  assert.equal(deckReady(r.s), false, "one chip of three: Next is quiet");
  r.send({ type: "next" });
  assert.equal(r.s.phase, "saved", "Next early: saved with what was said, no nudge");
  assert.deepEqual(r.s.answers[0]?.covered, ["h0"]);
  r.fire("advance");
  r.fire("listen").speakAttempt(1, 0);
  assert.equal(deckReady(r.s), true);
  assert.equal(r.s.announce, "That covers it. Tap Next when you're ready.");
  r.fire("pause").fire("check");
  assert.equal(r.s.phase, "listening");
  r.send({ type: "next" });
  assert.equal(r.s.phase, "got");
});

test("a pause skips only when the whole answer is a skip phrase", () => {
  const r = new Run(createDeck(questions()));
  r.fire("listen").say("I don't know maybe Sam does it").fire("pause").fire("check");
  assert.notEqual(r.s.phase, "skipped", "a skip phrase followed by an answer is an answer");
  const r2 = new Run(createDeck(questions()));
  r2.fire("listen").say("Hmm, I don't know yet.").fire("pause").fire("check");
  assert.equal(r2.s.phase, "skipped");
  assert.equal(r2.s.answers[0]?.reason, "dontknow");
});
