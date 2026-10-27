/**
 * Client view-state machine for a conversation screen.
 *
 * The server owns canonical conversation state (PRD 12: CREATED → … →
 * SUBMITTED). This machine only tracks what the phone is doing between
 * server acknowledgements: whether the microphone is open, whether a turn is
 * in flight, and which recovery options to offer. It is pure so it can be
 * unit tested without React.
 *
 *   prompting ──AGENT_SHOWN──▶ answering ──SUBMIT_ANSWER──▶ sending
 *       ▲                         │  ▲                         │
 *       │                   PAUSE │  │ RESUME                  │ TURN_ACK
 *       │                         ▼  │                         ▼
 *       │                        paused                 prompting | closing
 *       │
 *   sending ──TURN_FAILED──▶ providerError | offlineDraft ──RETRY──▶ sending
 *   answering(voice) ──MIC_DENIED──▶ micError ──SWITCH_TO_TEXT──▶ answering(text)
 */

export type InputMode = 'voice' | 'text';

export type Phase =
  | 'prompting' // DutyGraph's question is being shown/spoken
  | 'answering' // microphone open or text box active
  | 'paused' // microphone paused by the participant
  | 'sending' // PROCESSING_TURN: waiting for server acknowledgement
  | 'closing' // server says the conversation is complete; review is being prepared
  | 'micError' // microphone blocked
  | 'providerError' // STT / model provider failed
  | 'offlineDraft'; // no connection: answer kept locally

export interface ConversationViewState {
  phase: Phase;
  inputMode: InputMode;
  /** The answer awaiting acknowledgement, kept so retries resend the same utterance id. */
  pendingUtteranceId?: string;
  pendingText?: string;
  /** Seconds of active listening for the current answer. */
  listeningSeconds: number;
  switchedToText: boolean;
}

export type ConversationEvent =
  | { type: 'AGENT_SHOWN' }
  | { type: 'TICK'; seconds: number }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'SWITCH_TO_TEXT' }
  | { type: 'SWITCH_TO_VOICE' }
  | { type: 'MIC_DENIED' }
  | { type: 'SUBMIT_ANSWER'; utteranceId: string; text: string }
  | { type: 'TURN_ACK'; reviewReady: boolean }
  | { type: 'TURN_FAILED'; reason: 'provider' | 'offline' }
  | { type: 'RETRY' };

export function initialViewState(inputMode: InputMode): ConversationViewState {
  return { phase: 'prompting', inputMode, listeningSeconds: 0, switchedToText: false };
}

export function transition(s: ConversationViewState, e: ConversationEvent): ConversationViewState {
  switch (e.type) {
    case 'AGENT_SHOWN':
      return s.phase === 'prompting' ? { ...s, phase: 'answering', listeningSeconds: 0 } : s;

    case 'TICK':
      return s.phase === 'answering' && s.inputMode === 'voice'
        ? { ...s, listeningSeconds: s.listeningSeconds + e.seconds }
        : s;

    case 'PAUSE':
      return s.phase === 'answering' && s.inputMode === 'voice' ? { ...s, phase: 'paused' } : s;

    case 'RESUME':
      return s.phase === 'paused' ? { ...s, phase: 'answering' } : s;

    case 'SWITCH_TO_TEXT':
      // Allowed from anywhere the participant is not waiting on the server.
      if (s.phase === 'sending' || s.phase === 'closing') return s;
      return {
        ...s,
        inputMode: 'text',
        switchedToText: true,
        phase: s.phase === 'prompting' ? 'prompting' : s.phase === 'offlineDraft' ? 'offlineDraft' : 'answering',
      };

    case 'SWITCH_TO_VOICE':
      if (s.phase !== 'answering' && s.phase !== 'prompting') return s;
      return { ...s, inputMode: 'voice', listeningSeconds: 0 };

    case 'MIC_DENIED':
      return { ...s, phase: 'micError' };

    case 'SUBMIT_ANSWER':
      if (s.phase !== 'answering' && s.phase !== 'paused') return s;
      if (!e.text.trim()) return s;
      return { ...s, phase: 'sending', pendingUtteranceId: e.utteranceId, pendingText: e.text };

    case 'TURN_ACK':
      if (s.phase !== 'sending') return s;
      return {
        ...s,
        phase: e.reviewReady ? 'closing' : 'prompting',
        pendingUtteranceId: undefined,
        pendingText: undefined,
        listeningSeconds: 0,
      };

    case 'TURN_FAILED':
      if (s.phase !== 'sending') return s;
      return { ...s, phase: e.reason === 'offline' ? 'offlineDraft' : 'providerError' };

    case 'RETRY':
      if ((s.phase === 'providerError' || s.phase === 'offlineDraft') && s.pendingUtteranceId) {
        return { ...s, phase: 'sending' };
      }
      if (s.phase === 'micError') return { ...s, phase: 'answering' };
      return s;
  }
}

/** Whether the "Type instead" affordance should be offered. Voice is never the only way. */
export function canTypeInstead(s: ConversationViewState): boolean {
  return s.inputMode === 'voice' && s.phase !== 'sending' && s.phase !== 'closing';
}
