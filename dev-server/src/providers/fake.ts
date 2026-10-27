import { readFileSync } from 'node:fs';
import { FAILSAFE_JUDGMENTS, type JudgmentByKind, type JudgmentKind } from '../../../shared/companion-judgment.ts';
import { issueFakeRealtimeGrant } from '../fake-realtime.ts';
import { durationFor, transcriptionSettings } from './common.ts';
import { FACILITATOR_TRIGGERS, type FacilitatorTrigger, type FacilitatorTurn, type ProviderConfig, type Providers } from './types.ts';

const silentMp3 = readFileSync(new URL('./silence.mp3', import.meta.url));
const script: Record<FacilitatorTrigger, FacilitatorTurn> = {
  opening: { text: "I'm the DutyGraph assistant. Nothing is final until you review it. Please each say your name and role.", action: 'ASK_QUESTION' },
  timebox_end: { text: 'Our time for this topic is up. Would you like two more minutes, or should we park it?', action: 'PARK_TOPIC' },
  silence: { text: 'What do we still need to know about this topic?', action: 'ASK_QUESTION' },
  leader_next: { text: 'Let us move to the next topic. What result do we need here?', action: 'TRANSITION_TOPIC' },
  slot_empty: { text: 'Who will own this action?', action: 'ASK_FOLLOW_UP' },
  closing: { text: 'Let us check the decisions, actions, owners, dates, and open questions before we finish.', action: 'RECOMMEND_CLOSURE' },
};
export function createFakeProviders(config: ProviderConfig = {}): Providers {
  return {
    metadata: { tts: 'fake', liveTranscription: 'fake', transcription: 'fake', conversation: 'fake', judgment: 'fake', realtime: 'fake' },
    tts: { async synthesize({ text, speed = 1 }) { return { audio: Buffer.from(silentMp3), durationMs: durationFor(text, speed), mimeType: 'audio/mpeg', contentType: 'audio/mpeg' }; } },
    liveTranscription: { async mint({ keywords } = {}) { return config.fakeLiveTranscription ? { available: true, ...issueFakeRealtimeGrant(config.liveSeconds), wsUrl: config.fakeWsUrl || 'ws://localhost:4417/fake-realtime', model: 'fake-transcription', transcription: transcriptionSettings(config, keywords) } : { available: false, reason: 'NOT_CONFIGURED' }; } },
    transcription: { async transcribe() { const segments = [{ startMs: 0, endMs: 3000, text: 'I check the delivery queue each morning.', speakerCluster: 'S1' }, { startMs: 3000, endMs: 6000, text: 'Priya owns the carrier credentials.', speakerCluster: 'S2' }]; return { text: segments.map(s => s.text).join(' '), segments }; } },
    conversation: {
      async turn({ trigger, addressedToPersonId }) {
        if (!FACILITATOR_TRIGGERS.includes(trigger)) throw new Error('INVALID_TRIGGER');
        return { ...script[trigger], ...(addressedToPersonId ? { addressedToPersonId } : {}) };
      },
      async generateTurn() { return { utterance: script.silence.text, model: 'fake-conversation', finishReason: 'stop' }; },
    },
    judgment: { async assess<K extends JudgmentKind>(kind: K, input: unknown): Promise<JudgmentByKind[K]> {
      // Policy-specific meeting rules live in shared/meetings. The provider's safe default never invents evidence.
      void input; return structuredClone(FAILSAFE_JUDGMENTS[kind]);
    } },
    realtime: { async mint() { return { available: true, ...issueFakeRealtimeGrant(), model: 'fake-realtime', simulated: true }; } },
  };
}
