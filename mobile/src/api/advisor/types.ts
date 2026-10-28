import type {
  AdvisorSession,
  MeetingDefinition,
  MeetingSession,
  MeetingAttendee,
  TranscriptSegment,
  ParkedItem,
  SpeakerMap,
  MeetingProposal,
  KickoffNote,
  SetupProposal,
  PulseTeamStatus,
  ClosingItem,
  ClosingOutcomeReview,
} from "../../../../shared/meetings/types";
export type {
  AdvisorSession,
  MeetingDefinition,
  MeetingSession,
  MeetingAttendee,
  TranscriptSegment,
  MeetingProposal,
  KickoffNote,
  SetupProposal,
  ClosingItem,
  ClosingOutcomeReview,
};
/** Explicit attribution is an input instruction, never inferred from a speaker cluster. */
export type TranscriptInput = TranscriptSegment & { personKey?: string };
export type Person = {
  id: string;
  name: string;
  role: string;
  department: string;
};
export type CreateMeeting = {
  previousMeetingId?: string;
  title: string;
  startsAt: string | null;
  minutes: number;
  purpose: string;
  outcomes: string[];
  execution: string;
  attendees: MeetingAttendee[];
  agenda?: MeetingDefinition["agenda"];
  meetingType?: NonNullable<MeetingDefinition["meetingType"]>;
};
export type ClosingReadiness = {
  complete: boolean;
  partial: boolean;
  missingOutcomes: number;
  unconfirmedActions: number;
};
export type SaveClosing = {
  expectedVersion: number;
  contentHash: string;
  outcomes: ClosingOutcomeReview[];
  followUpPlan?: string;
};
export type SessionDetail = MeetingSession & {
  transcript: TranscriptSegment[];
  parked: ParkedItem[];
  speakerMap: SpeakerMap;
  proposals: MeetingProposal[];
  closing?: ClosingItem[];
  outcomeReviews?: ClosingOutcomeReview[];
  followUpPlan?: string;
  closingReadiness?: ClosingReadiness;
};
export type Coach = {
  nextQuestion: string;
  addressedToPersonId?: string;
  stillNeeded: string[];
  flags: string[];
};
export type PulseStatus = PulseTeamStatus & {
  id?: string;
  gate?: MeetingDefinition["gate"];
};
export type Trigger =
  | "opening"
  | "timebox_end"
  | "silence"
  | "leader_next"
  | "slot_empty"
  | "closing";
/** All screen data crosses this boundary. Commands require a stable key for retries. */
export interface AdvisorRepository {
  readonly kind: "mock" | "http";
  voiceLines(
    input: { lines: { id: string; text: string }[]; speed?: number },
    key: string,
  ): Promise<{
    lines: {
      id: string;
      url: string;
      hash: string;
      durationMs: number;
      mimeType?: "audio/mpeg" | "audio/wav";
      simulated?: boolean;
    }[];
  }>;
  pair(code: string, key: string): Promise<AdvisorSession>;
  logout(key: string): Promise<void>;
  people(): Promise<Person[]>;
  meetings(): Promise<MeetingDefinition[]>;
  meeting(id: string): Promise<MeetingDefinition>;
  create(input: CreateMeeting, key: string): Promise<MeetingDefinition>;
  patch(
    id: string,
    patch: Partial<CreateMeeting> & {
      expectedVersion: number;
      contentHash?: string;
    },
    key: string,
  ): Promise<MeetingDefinition>;
  plan(id: string, key: string): Promise<MeetingDefinition>;
  route(
    id: string,
    choice: "pulse" | "shorter" | "as_planned",
    key: string,
    reviewed?: Pick<MeetingDefinition, "version" | "hash">,
  ): Promise<MeetingDefinition>;
  pulse(id: string, create?: boolean, key?: string): Promise<PulseStatus>;
  start(
    id: string,
    mode: MeetingSession["mode"],
    key: string,
    voice?: "tts_lines" | "realtime",
  ): Promise<MeetingSession>;
  realtime(
    id: string,
    input: { sdp: string; summary?: string },
    key: string,
  ): Promise<import("@/features/voice/meeting/realtime/types").RealtimeGrant>;
  session(id: string): Promise<SessionDetail>;
  consent(
    id: string,
    attendees: MeetingSession["consents"],
    key: string,
  ): Promise<MeetingSession>;
  transcript(
    id: string,
    segments: TranscriptInput[],
    key: string,
  ): Promise<void>;
  coach(id: string, key: string): Promise<Coach>;
  park(id: string, text: string, atMs: number, key: string): Promise<void>;
  turn(
    id: string,
    trigger: Trigger,
    key: string,
  ): Promise<{ text: string; action: string; promptVersion: string }>;
  state(id: string, to: string, key: string): Promise<void>;
  control(
    id: string,
    control: "mute" | "unmute" | "stop" | "skip",
    key: string,
  ): Promise<void>;
  topic(id: string, topicId: string | null, key: string): Promise<void>;
  uploadSegment(input: {
    sessionId: string;
    segment: { id: string; hash: string; bytes: number; durationMs: number };
    offset: number;
    bytes: Uint8Array;
    final: boolean;
  }): Promise<{ uploadedBytes: number }>;
  finish(id: string, key: string): Promise<void>;
  speakers(id: string, map: SpeakerMap, key: string): Promise<SpeakerMap>;
  decide(
    proposal: MeetingProposal,
    decision: "accept" | "reject" | "edit",
    key: string,
    body?: MeetingProposal["body"],
  ): Promise<MeetingProposal>;
  confirm(sessionId: string, item: ClosingItem, key: string): Promise<void>;
  saveClosing(
    sessionId: string,
    input: SaveClosing,
    key: string,
  ): Promise<void>;
  complete(
    sessionId: string,
    reviewed: { expectedVersion: number; contentHash: string },
    key: string,
  ): Promise<MeetingDefinition>;
  followUp(proposalId: string, personId: string, key: string): Promise<void>;
  export(id: string): Promise<{ markdown: string; json: unknown }>;
  audioSource(
    id: string,
    startMs: number,
  ): Promise<{
    uri: string;
    headers: Record<string, string>;
    offsetSeconds: number;
  } | null>;
  notes(
    meetingId: string,
    notes: KickoffNote[],
    key: string,
  ): Promise<KickoffNote[] | void>;
  setup(key: string): Promise<{ id: string }>;
  understandSetup(
    id: string,
    answers: Record<string, string>,
    key: string,
  ): Promise<SetupProposal[]>;
  confirmSetup(
    id: string,
    proposals: SetupProposal[],
    key: string,
  ): Promise<void>;
}
