import type { components } from "../generated/companion-mobile-v1";
import type {
  HandsFreeQuestion,
  QuestionSet,
  SubmitAnswersInput,
  SubmitAnswersResult,
} from "@/types/handsfree";
import type { Pulse, TeamStatus } from "@/types/domain";
export type TaskCardRecord = components["schemas"]["TaskCardView"];
export type TaskCardDecision =
  "correct" | "needs_change" | "not_mine" | "unsure";
export type TaskDecisionInput = {
  taskCardId: string;
  decision: TaskCardDecision;
  note?: string;
  recordVersion: number;
  contentHash: string;
  idempotencyKey: string;
};
export type TaskDecisionResult = {
  acknowledged: boolean;
  pending: boolean;
  taskCardId: string;
  message?: string;
};
export type VoiceLinesInput = {
  requestId?: string;
  lines: { id: string; text: string }[];
  speed?: number;
  voice?: string;
};
export type VoiceLinesResult = {
  lines: { id: string; url: string; hash: string; durationMs: number }[];
};
export type LiveTranscriptionGrant =
  | { available: false; reason?: string }
  | {
      available: true;
      secret: string;
      url?: string;
      model?: string;
      keywords?: string[];
      expiresAt?: number;
    };
export type PulseDto = {
  id: string;
  meetingId?: string;
  title: string;
  dueAt: string;
  estimateMinutes: number;
  questions: (
    | HandsFreeQuestion
    | { text: string; short?: string; hints?: HandsFreeQuestion["hints"] }
  )[];
  version: number;
  contentHash: string;
  state: string;
  companyName?: string;
  advisorName?: string;
  teamStatusVisible?: boolean;
};
export type ParticipantFeatureConfig = {
  speakQuestions: boolean;
  followUps: "table" | "ai";
  autoAdvance: boolean;
  liveTranscription: boolean;
};
export interface ParticipantExtrasRepository {
  getConfirmation(id: string): Promise<ParticipantConfirmation>;
  decideConfirmation(input: ConfirmationDecisionInput): Promise<void>;
  checkCoverage(
    input: import("@/types/handsfree").CoverageCheckInput,
  ): Promise<import("@/types/handsfree").ServerCoverage>;
  getConfig(): Promise<ParticipantFeatureConfig>;
  transcribeCardBackup(input: {
    requestId: string;
    uri: string;
    mimeType: string;
    durationMs: number;
  }): Promise<{ text: string }>;
  getVoiceLines(input: VoiceLinesInput): Promise<VoiceLinesResult>;
  getVoiceDownloadHeaders(): Promise<Record<string, string>>;
  createLiveTranscriptionGrant(
    requestId: string,
  ): Promise<LiveTranscriptionGrant>;
  getTaskCards(requestId: string): Promise<TaskCardRecord[]>;
  decideTaskCard(input: TaskDecisionInput): Promise<TaskDecisionResult>;
  getPendingTaskDecisions(): Promise<TaskDecisionInput[]>;
  retryPendingTaskDecisions(): Promise<TaskDecisionResult[]>;
  getPulse(id: string): Promise<Pulse>;
  getPulseQuestions(id: string): Promise<QuestionSet>;
  getTeamStatus(id: string): Promise<TeamStatus>;
  submitPulse(input: SubmitAnswersInput): Promise<SubmitAnswersResult>;
}
export type ConfirmationSummary = {
  id: string;
  meetingId: string;
  title: string;
  itemCount: number;
  complete: boolean;
};
export type ParticipantConfirmation = {
  id: string;
  meetingId: string;
  title: string;
  items: {
    id: string;
    proposalId: string;
    text: string;
    kind: string;
    version: number;
    hash: string;
    confirmation?: unknown;
  }[];
};
export type ConfirmationDecisionInput = {
  id: string;
  itemId: string;
  decision: "confirm" | "change" | "not_mine";
  note?: string;
  expectedVersion: number;
  contentHash: string;
  idempotencyKey: string;
};
