import type { MeetingProposal, SourceRef, TranscriptSegment, SpeakerMap } from "../../../shared/meetings/types.ts";
import type {
  JudgmentByKind,
  JudgmentKind,
  TextToSpeechProvider as SharedTts,
  ConversationModelProvider as SharedConversation,
} from "../../../shared/companion-judgment.ts";

export type ProviderKind = "fake" | "openai";
export interface ProviderConfig {
  apiKey?: string;
  apiBaseUrl?: string;
  liveApiKey?: string;
  liveModel?: string;
  liveDelay?: string;
  liveWsUrl?: string;
  liveSeconds?: number;
  ttsModel?: string;
  ttsVoice?: string;
  transcribeModel?: string;
  textModel?: string;
  realtimeModel?: string;
  fakeLiveTranscription?: boolean;
  fakeWsUrl?: string;
}
export interface TextToSpeechProvider extends SharedTts {
  synthesize(input: {
    text: string;
    voice?: string;
    speed?: number;
    language?: string;
  }): Promise<{
    audio: Buffer;
    mimeType: "audio/mpeg";
    contentType: "audio/mpeg";
    durationMs: number;
  }>;
}
export interface TranscriptionSettings {
  languages: string[];
  keywords?: string[];
  prompt: string;
  delay?: string;
}
export type LiveGrant =
  | {
      available: true;
      clientSecret: string;
      expiresAt: number;
      wsUrl: string;
      model: string;
      transcription: TranscriptionSettings;
    }
  | { available: false; reason: string };
export interface LiveTranscriptionGrantProvider {
  mint(input?: { keywords?: string[] }): Promise<LiveGrant>;
}
export interface TranscriptionSegment {
  startMs: number;
  endMs: number;
  text: string;
  speakerCluster: string | null;
}
export interface TranscriptionProvider {
  transcribe(input: {
    audio: Uint8Array;
    mimeType?: string;
    language?: string;
  }): Promise<{ text: string; segments: TranscriptionSegment[] }>;
}
export const FACILITATOR_TRIGGERS = [
  "opening",
  "timebox_end",
  "silence",
  "leader_next",
  "slot_empty",
  "closing",
] as const;
export const FACILITATOR_ACTIONS = [
  "ASK_QUESTION",
  "ASK_FOLLOW_UP",
  "REQUEST_EXAMPLE",
  "CLARIFY_AMBIGUITY",
  "SUMMARIZE_FINDING",
  "CONFIRM_FINDING",
  "TRANSITION_TOPIC",
  "FLAG_CONTRADICTION",
  "REQUEST_HUMAN_REVIEW",
  "PARK_TOPIC",
  "RECOMMEND_CLOSURE",
  "CLOSE_SESSION",
] as const;
export type FacilitatorTrigger = (typeof FACILITATOR_TRIGGERS)[number];
export interface FacilitatorTurn {
  text: string;
  action: (typeof FACILITATOR_ACTIONS)[number];
  addressedToPersonId?: string;
}
export interface ExtractionInput {
  transcript: TranscriptSegment[];
  speakerMap: SpeakerMap;
  attendees: { personKey: string; name: string }[];
  taskCards: { id: string; title: string }[];
}
export interface ExtractionOutput {
  proposals: { body: MeetingProposal["body"]; sources: SourceRef[]; evidence: MeetingProposal["evidence"] }[];
}
export interface ConversationModelProvider extends SharedConversation {
  extract(input: ExtractionInput): Promise<ExtractionOutput>;
  turn(input: {
    trigger: FacilitatorTrigger;
    prompt: string;
    addressedToPersonId?: string;
  }): Promise<FacilitatorTurn>;
}
export interface JudgmentProvider {
  assess<K extends JudgmentKind>(
    kind: K,
    input: unknown,
  ): Promise<JudgmentByKind[K]>;
}
export type RealtimeGrant =
  | {
      available: true;
      clientSecret: string;
      expiresAt: number;
      model: string;
      simulated?: boolean;
    }
  | { available: true; sdp: string; model: string }
  | { available: false; reason: string };
export interface RealtimeSessionProvider {
  mint(input: { instructions: string; sdp?: string }): Promise<RealtimeGrant>;
}
export interface Providers {
  metadata: Record<
    | "tts"
    | "liveTranscription"
    | "transcription"
    | "conversation"
    | "judgment"
    | "realtime",
    ProviderKind
  >;
  tts: TextToSpeechProvider;
  liveTranscription: LiveTranscriptionGrantProvider;
  transcription: TranscriptionProvider;
  conversation: ConversationModelProvider;
  judgment: JudgmentProvider;
  realtime: RealtimeSessionProvider;
}
