import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck, deckReducer, deckVoice, deckMic, deckText, DECK_TIMING, type DeckState } from '../shared/hands-free/deck.ts';
import type { HandsFreeQuestion } from '../shared/hands-free/types.ts';
const questions: HandsFreeQuestion[] = [
  { key: 'question.0', index: 0, text: 'What tools?', short: 'Tools', hints: [{ id: 'h0', label: 'Tools', nudge: 'Which tools?', cues: ['hammer'] }] },
  { key: 'question.1', index: 1, text: 'Anything else?', short: 'Else', hints: [], isElse: true },
];
const fire = (s: DeckState) => deckReducer(s, { type: 'timer', id: s.timer!.id });
const end = (s: DeckState) => deckReducer(s, { type: 'speechOutEnd', lineId: deckVoice(s)!.lineId });
const say = (s: DeckState, text: string) => deckReducer(s, { type: 'speech', session: deckMic(s).session, text });

test('question audio warms the mic, suppresses echo, and ends on callback or fallback', () => {
  let s = createDeck(questions, { speak: true });
  assert.equal(deckVoice(s)?.text, 'What tools?');
  assert.equal(deckMic(s).on, true);
  assert.equal(deckText(say(s, 'hammer')), '');
  assert.equal(deckReducer(s, { type: 'speechOutEnd', lineId: 'stale' }), s);
  assert.equal(s.timer?.ms, 2 * 400 + DECK_TIMING.speakFallback);
  s = fire(s);
  assert.equal(s.phase, 'listening');
  assert.equal(deckVoice(s), null);
});

test('barge-in drops echo and rejects old microphone session', () => {
  let s = createDeck(questions, { speak: true });
  const old = s.session;
  s = deckReducer(s, { type: 'bargeIn' });
  assert.equal(s.phase, 'listening');
  assert.equal(deckVoice(s), null);
  assert.equal(deckText(deckReducer(s, { type: 'speech', session: old, text: 'hammer' })), '');
  assert.equal(deckText(say(s, 'hammer')), 'hammer');
});

test('pause replays question with a fresh line, and skip sheet stops playback', () => {
  let s = createDeck(questions, { speak: true });
  const id = deckVoice(s)!.lineId;
  s = deckReducer(s, { type: 'pause' });
  assert.equal(deckVoice(s), null);
  s = deckReducer(s, { type: 'resume' });
  assert.notEqual(deckVoice(s)?.lineId, id);
  s = deckReducer(s, { type: 'openSkip' });
  assert.equal(deckVoice(s), null);
});

test('nudge uses validated follow-up for the missing hint, with table fallback', () => {
  let s = end(createDeck(questions, { speak: true, followUps: 'ai', serverCheck: true }));
  s = say(s, 'I work'); s = fire(s);
  s = deckReducer(s, { type: 'serverCoverage', checkId: s.check!.id, covered: [], followUp: { hintId: 'h0', text: 'Which tool do you use?' } });
  s = fire(s); s = fire(s);
  assert.equal(deckVoice(s)?.text, 'Which tool do you use?');
  assert.equal(s.nudges, 1);
});

test('auto advance waits after acknowledgment, and any new word cancels', () => {
  let s = end(createDeck(questions, { speak: true, autoAdvance: true }));
  s = say(s, 'hammer'); s = fire(s); s = fire(s);
  assert.equal(deckVoice(s)?.kind, 'line');
  s = end(s);
  assert.equal(deckText(s), 'hammer');
  assert.equal(s.timer?.kind, 'autoAdvance');
  const stale = s.timer!.id;
  s = say(s, 'also');
  assert.equal(s.autoPending, false);
  s = deckReducer(s, { type: 'timer', id: stale });
  assert.equal(s.answers[0], null);
  assert.equal(deckText(s), 'hammer also');
});

test('auto advance can finish only after its wait; else card never auto advances', () => {
  let s = end(createDeck(questions, { speak: true, autoAdvance: true }));
  s = say(s, 'hammer'); s = fire(s); s = fire(s); s = end(s); s = fire(s);
  assert.equal(s.answers[0]?.raw, 'hammer');
  s = fire(s); assert.equal(deckVoice(s)?.kind, 'question');
  s = end(s); s = say(s, 'something'); s = fire(s);
  assert.equal(s.answers[1], null);
  s = deckReducer(s, { type: 'finish' });
  assert.equal(deckVoice(s)?.kind, 'line');
});

test('starting audio leaves the original fallback deadline and stale callbacks alone', () => {
  let s = createDeck(questions, { speak: true });
  const line = deckVoice(s)!;
  const timer = s.timer;
  assert.equal(deckReducer(s, { type: 'speechOutStart', lineId: line.lineId }), s);
  assert.equal(s.timer, timer);
  s = deckReducer(s, { type: 'speechOutError', lineId: line.lineId });
  assert.equal(s.phase, 'listening');
  assert.equal(deckReducer(s, { type: 'speechOutEnd', lineId: line.lineId }), s);
  assert.equal(deckReducer(s, { type: 'timer', id: timer!.id }), s);
});

test('barge-in during a nudge preserves the answer already heard', () => {
  let s = end(createDeck(questions, { speak: true }));
  s = say(s, 'I use equipment'); s = fire(s); s = fire(s); s = fire(s);
  assert.equal(deckVoice(s)?.kind, 'nudge');
  const line = deckVoice(s)!;
  s = deckReducer(s, { type: 'bargeIn' });
  assert.equal(deckText(s), 'I use equipment');
  assert.equal(deckReducer(s, { type: 'speechOutEnd', lineId: line.lineId }), s);
  s = say(s, 'a hammer');
  assert.equal(deckText(s), 'I use equipment a hammer');
});

test('pause during a nudge resumes with the question and no old callback can finish it', () => {
  let s = end(createDeck(questions, { speak: true }));
  s = say(s, 'equipment'); s = fire(s); s = fire(s); s = fire(s);
  const old = deckVoice(s)!;
  s = deckReducer(s, { type: 'pause' });
  assert.equal(deckMic(s).on, false);
  s = deckReducer(s, { type: 'resume' });
  assert.equal(deckVoice(s)?.text, 'What tools?');
  assert.notEqual(deckVoice(s)?.lineId, old.lineId);
  assert.equal(deckReducer(s, { type: 'speechOutEnd', lineId: old.lineId }), s);
  s = end(s);
  assert.equal(deckText(s), 'equipment');
});

test('skip sheet stops output, blocks stale callbacks, and a selected skip cancels it', () => {
  let s = createDeck(questions, { speak: true });
  const line = deckVoice(s)!;
  s = deckReducer(s, { type: 'openSkip' });
  assert.equal(deckVoice(s), null);
  assert.equal(deckMic(s).on, false);
  assert.equal(deckReducer(s, { type: 'speechOutEnd', lineId: line.lineId }), s);
  s = deckReducer(s, { type: 'skip', reason: 'skip' });
  assert.equal(s.phase, 'skipped');
  assert.equal(deckVoice(s), null);
  assert.equal(deckReducer(s, { type: 'speechOutEnd', lineId: line.lineId }), s);
});

test('previous, returning, and Add more do not replay questions', () => {
  let s = end(createDeck(questions, { speak: true }));
  s = say(s, 'hammer');
  s = deckReducer(s, { type: 'next' });
  assert.equal(deckVoice(s)?.text, 'Got it.');
  s = fire(s);
  assert.equal(deckVoice(s)?.text, 'One last thing. Anything else?');
  s = deckReducer(s, { type: 'prev' });
  assert.equal(deckVoice(s), null);
  s = deckReducer(s, { type: 'return' });
  assert.equal(s.phase, 'listening');
  assert.equal(deckVoice(s), null);
  s = deckReducer(s, { type: 'prev' });
  s = deckReducer(s, { type: 'addMore' });
  assert.equal(s.phase, 'listening');
  assert.equal(deckVoice(s), null);
  assert.equal(deckText(s), 'hammer');
});

test('explicit replay uses a fresh line and retains the prior words', () => {
  let s = end(createDeck(questions, { speak: true }));
  s = say(s, 'hammer');
  s = deckReducer(s, { type: 'replayQuestion' });
  assert.equal(deckVoice(s)?.text, 'What tools?');
  s = end(s);
  assert.equal(deckText(s), 'hammer');
  s = deckReducer(s, { type: 'openSkip' });
  assert.equal(deckReducer(s, { type: 'replayQuestion' }), s);
});

test('review line is emitted once, and its completion and stale callbacks cannot replay it', () => {
  let s = end(createDeck(questions, { speak: true }));
  s = deckReducer(s, { type: 'next' }); s = fire(s); s = end(s);
  s = deckReducer(s, { type: 'finish' });
  assert.equal(deckVoice(s)?.text, "Here's what we heard. Check it, then tap Send.");
  const line = deckVoice(s)!;
  s = end(s);
  assert.equal(deckVoice(s), null);
  assert.equal(deckReducer(s, { type: 'finish' }), s);
  assert.equal(deckReducer(s, { type: 'speechOutEnd', lineId: line.lineId }), s);
});

test('barge-in during auto acknowledgment cancels the advance and retains the answer', () => {
  let s = end(createDeck(questions, { speak: true, autoAdvance: true }));
  s = say(s, 'hammer'); s = fire(s); s = fire(s);
  const line = deckVoice(s)!;
  assert.equal(line.text, 'Got it. Next question.');
  s = deckReducer(s, { type: 'bargeIn' });
  assert.equal(s.autoPending, false);
  assert.equal(deckText(s), 'hammer');
  assert.equal(deckReducer(s, { type: 'speechOutEnd', lineId: line.lineId }), s);
  assert.equal(s.answers[0], null);
});

test('missing chips never auto advance and late server coverage never advances the card', () => {
  let s = end(createDeck(questions, { speak: true, autoAdvance: true, serverCheck: true }));
  s = say(s, 'equipment'); s = fire(s);
  const check = s.check!.id;
  s = fire(s); // minimum checking time, waiting for server
  s = deckReducer(s, { type: 'serverCoverage', checkId: check, covered: ['h0'] });
  assert.equal(s.answers[0], null);
  assert.equal(s.autoPending, false);
  assert.equal(s.phase, 'listening');
  let missing = end(createDeck(questions, { speak: true, autoAdvance: true }));
  missing = say(missing, 'equipment'); missing = fire(missing); missing = fire(missing); missing = fire(missing);
  assert.equal(deckVoice(missing)?.kind, 'nudge');
  assert.equal(missing.answers[0], null);
});

test('speech during checking cancels that check; late server follow-up cannot speak', () => {
  let s = end(createDeck(questions, { speak: true, followUps: 'ai', serverCheck: true }));
  s = say(s, 'equipment'); s = fire(s);
  const check = s.check!.id;
  s = say(s, 'equipment and hammer');
  assert.equal(s.phase, 'listening');
  const next = deckReducer(s, { type: 'serverCoverage', checkId: check, covered: [], followUp: { hintId: 'h0', text: 'Which tool?' } });
  assert.equal(next, s);
  assert.equal(deckVoice(s), null);
});

test('nudge waits for quiet and new words before playback cancel it without refunding the nudge', () => {
  let s = end(createDeck(questions, { speak: true }));
  s = say(s, 'equipment'); s = fire(s); s = fire(s);
  assert.equal(s.phase, 'more');
  assert.equal(s.timer?.kind, 'nudge');
  assert.equal(s.timer?.ms, DECK_TIMING.pauseToCheck);
  assert.equal(deckVoice(s), null);
  const old = s.timer!.id;
  s = say(s, 'equipment hammer');
  assert.equal(s.phase, 'listening');
  assert.equal(s.nudges, 1);
  assert.equal(deckReducer(s, { type: 'timer', id: old }), s);
  assert.equal(deckVoice(s), null);
});

test('recognizer end waits for a quiet interval before any spoken follow-up or auto advance', () => {
  let s = end(createDeck(questions, { speak: true, autoAdvance: true }));
  s = say(s, 'hammer');
  s = deckReducer(s, { type: 'speechEnd', session: s.session });
  assert.equal(s.phase, 'listening');
  assert.equal(s.timer?.kind, 'pause');
  assert.equal(s.timer?.ms, DECK_TIMING.pauseToCheck);
  const old = s.timer!.id;
  s = say(s, 'hammer and another tool');
  assert.equal(deckReducer(s, { type: 'timer', id: old }), s);
  assert.equal(s.answers[0], null);
});
