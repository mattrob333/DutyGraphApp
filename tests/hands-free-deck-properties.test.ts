import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck, deckReducer, deckVoice, deckMic, type DeckEvent } from '../shared/hands-free/deck.ts';
import type { HandsFreeQuestion } from '../shared/hands-free/types.ts';
const qs: HandsFreeQuestion[] = [{ key: 'question.0', index: 0, text: 'What tool?', short: 'Tool', hints: [{ id: 'h0', label: 'Tool', nudge: 'Which tool?', cues: ['hammer'] }] }, { key: 'question.1', index: 1, text: 'Anything else?', short: 'Else', hints: [], isElse: true }];

test('random event sequences retain echo guard and reject stale timers', () => {
  let seed = 1234567;
  const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0);
  for (let run = 0; run < 100; run++) {
    let s = createDeck(qs, { speak: true, autoAdvance: true });
    for (let i = 0; i < 150; i++) {
      const line = deckVoice(s);
      const events: DeckEvent[] = [
        { type: 'speech', session: deckMic(s).session, text: 'hammer ' + i },
        { type: 'bargeIn' }, { type: 'timer', id: s.timer?.id ?? -1 },
        { type: 'timer', id: -1 }, { type: 'speechOutEnd', lineId: line?.lineId ?? 'stale' },
        { type: 'pause' }, { type: 'resume' }, { type: 'openSkip' }, { type: 'closeSkip' },
        { type: 'keepTalking' }, { type: 'prev' }, { type: 'return' },
      ];
      const event = events[rand() % events.length];
      const before = s;
      s = deckReducer(s, event);
      if (event.type === 'speech' && before.phase === 'speaking') assert.equal(s, before);
      if (event.type === 'timer' && event.id === -1) assert.equal(s, before);
      if (event.type === 'speech' && before.phase === 'listening' && event.text !== before.live) assert.equal(s.answers[before.idx], before.answers[before.idx]);
    }
  }
});
