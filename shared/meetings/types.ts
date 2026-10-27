import type { MeetingType, MeetingMode, MeetingFacilitatorState } from "../companion-judgment.ts";
import type { HandsFreeQuestion } from "../hands-free/types.ts";

type TaskCardView = { data: { duty?: string; purpose?: string; trigger?: string; inputs?: string; instructions?: string; output?: string; systems?: string[]; humanGate?: string; destination?: string; mode?: string } };

export type ParticipantRole = 'decision_maker' | 'influencer' | 'resource' | 'executor' | 'needs_to_know';

export type MeetingAttendee = {
  personId: string | null;          // null for a guest
  guest?: { name: string; role: string };  // a guest becomes a *proposed* person
  name: string;
  roles: ParticipantRole[];
};

export type MeetingDefinition = {
  id: string; companyId: string; version: number; hash: string;
  title: string; startsAt: string | null; minutes: number;
  power: {
    purpose: string;                 // P
    outcomes: string[];              // O (each becomes a closing checklist item)
    execution: string;               // E (what must happen to get there; what happens after)
  };                                 // W = attendees; R = filled in session (actions with owners)
  attendees: MeetingAttendee[];
  meetingType: MeetingType | null;   // from companion-judgment.ts
  secondaryPhases: MeetingType[];
  agenda: AgendaTopic[];
  gate: MeetingGateResult | null;
  routeChoice: 'pulse' | 'shorter' | 'as_planned' | null;
  state: MeetingLifecycleState;      // 05 §3
  createdBy: string; createdAt: string; updatedAt: string;
};

export type AgendaTopic = { id: string; title: string; minutes: number; forPersonIds: string[]; questions: string[]; outcomeIds: string[]; async: boolean };

export type MeetingGateResult = {
  mode: MeetingMode;                 // 'ASYNC' | 'LIVE' | 'HYBRID' | 'NO_MEETING' | 'INSUFFICIENT_INFO'
  route: 'NO_MEETING' | 'ASYNC' | 'INDIVIDUAL_INTERVIEW' | 'LIVE' | 'HUMAN_LED' | 'HUMAN_ESCALATION';
  reason: string;
  requiredPersonIds: string[]; releasedPersonIds: string[];
  liveMinutes: number | null; asyncTopicIds: string[];
  judgedBy: 'rules' | 'model';       // never shown to participants
};

export type MeetingLifecycleState = 'REQUESTED' | 'EVALUATING' | 'ROUTED' | 'PREPARING' | 'READY' | 'IN_SESSION' | 'EXTRACTING'
  | 'REVIEW_PENDING' | 'APPROVED' | 'PARTIALLY_APPROVED' | 'COMPLETE'
  | 'PAUSED' | 'RESCHEDULED' | 'CANCELLED' | 'PARTICIPANT_DISCONNECTED' | 'RECORDING_UNAVAILABLE' | 'CONSENT_WITHDRAWN'
  | 'NEEDS_HUMAN_FACILITATOR' | 'INSUFFICIENT_EVIDENCE' | 'TECHNICAL_FAILURE';

export type MeetingSession = {
  companyId: string; version: number; hash: string;
  id: string; meetingId: string; mode: 'capture' | 'copilot' | 'facilitator'; voice: 'tts_lines' | 'realtime' | 'simulated' | null;
  facilitatorState: MeetingFacilitatorState;   // from companion-judgment.ts
  currentTopicId: string | null; topicStartedAt: string | null;
  consents: AttendeeConsent[]; noticeVersion: string; appVersion: string;
  startedAt: string | null; endedAt: string | null;
  promptVersion: string | null; promptHash: string | null;  // from composeFacilitatorPrompt()
  budgetCents: number; spentCents: number;
  log: SessionLogEntry[];                       // append-only
};
export type AttendeeConsent = { personKey: string; name: string; state: 'pending' | 'consented' | 'declined'; at: string | null };
export type SessionLogEntry = { at: string; actor: 'leader' | 'ai' | 'system'; kind: string; from?: string; to?: string; reason?: string };

export type RecordingSegment = { sessionId: string; index: number; startedAt: string; durationMs: number; bytes: number; sha256: string;
  chunks: { index: number; sha256: string; uploaded: boolean }[]; state: 'recording' | 'queued' | 'uploading' | 'uploaded' | 'failed' };

export type TranscriptSegment = { id: string; revision: number; sessionId: string; startMs: number; endMs: number; text: string;
  speakerCluster: string | null;     // 'S1', 'S2' … per meeting only; never a voiceprint
  source: 'live' | 'batch'; committed: boolean; excluded?: 'declined_consent' | 'deleted_by_leader' };

export type SpeakerMap = { sessionId: string; entries: { cluster: string; personKey: string | null; suggested: boolean; confirmedBy: string | null }[] };
export type ParkedItem = { id: string; sessionId: string; text: string; speakerCluster: string | null; atMs: number; followUp: { personId: string; requestId: string | null } | null };

export type ProposalKind = 'decision' | 'action' | 'open_question' | 'task_card_delta' | 'responsibility_delta' | 'contradiction' | 'claim';
export type ProposalState = 'proposed' | 'accepted' | 'rejected' | 'stale';

export type SourceRef = { segmentId: string; revision: number; quote: string; speakerCluster: string | null; personKey: string | null };

export type MeetingProposal = {
  id: string; sessionId: string; kind: ProposalKind; state: ProposalState; version: number; hash: string;
  sources: SourceRef[];               // at least one
  evidence: 'observed' | 'belief' | 'assumption';
  body:
    | { kind: 'decision'; decision: string; decidedByPersonKey: string | null; rationale: string; alternatives: string[]; deferred: boolean; decideBy?: string }
    | { kind: 'action'; what: string; ownerPersonKey: string | null; due: string | null; reviewTrigger?: string; dependsOn: string[]; doneWhen: string;
        status: 'suggested' | 'proposed' | 'assigned' | 'accepted' | 'completed' }
    | { kind: 'open_question'; question: string; askPersonKey: string | null }
    | { kind: 'task_card_delta'; taskCardId: string | null; field: keyof TaskCardView['data'] | 'title'; from: string | null; to: string }
    | { kind: 'responsibility_delta'; personKey: string; duty: string; change: 'add' | 'remove' }
    | { kind: 'contradiction'; claimA: { text: string; source: SourceRef }; claimB: { text: string; source: SourceRef } }
    | { kind: 'claim'; fieldPath: string; value: string };
  decidedBy: string | null; decidedAt: string | null; editNote?: string;
};

export type ClosingItem = { proposalId: string; ownerPersonKey: string | null; confirmation: 'pending' | 'confirmed' | 'changed' | 'not_mine'; note?: string };

export type Pulse = { id: string; meetingId: string | null; title: string; dueAt: string; estimateMinutes: number;
  perPerson: { personId: string; questions: HandsFreeQuestion[]; state: 'not_started' | 'in_progress' | 'complete' }[] };
export type PulseTeamStatus = { total: number; done: number; people: { name: string; state: 'not_started' | 'in_progress' | 'complete' }[] }; // never answers

export type KickoffNote = { id: string; meetingId: string; topicId: 'business' | 'goals' | 'people' | 'duties' | 'tasks' | 'handoffs' | 'systems' | 'followup';
  speakerPersonId: string | null; text: string; at: string };
export type ClaimProposal = { fieldPath: string; value: string; quote: string; speakerPersonId: string | null };
export type SetupProposal = { fieldPath: string; value: string; quote: string; missingFields: string[]; source: 'owner_supplied' | 'advisor_supplied' };

export type SpokenLine = { id: string; text: string; voice: string; speed: number; hash: string; url: string; durationMs: number };

export type TaskCardDecision = { taskCardId: string; recordVersion: number; contentHash: string; decision: 'correct' | 'needs_change' | 'not_mine' | 'unsure'; note?: string };

export type AdvisorSession = { accessToken: string; refreshToken: string; accessExpiresAt: string; expiresAt: string;
  advisor: { id: string; name: string }; company: { id: string; name: string }; role: 'advisor_mobile' };

export type Person = { id: string; name: string; role: string; department: string };
export type MeetingCreateInput = { title: string; startsAt: string | null; minutes: number; purpose: string; outcomes: string[]; execution: string; attendees: MeetingAttendee[]; meetingType?: MeetingType; agenda?: AgendaTopic[] };
export type SessionSnapshot = MeetingSession & { transcript: TranscriptSegment[]; parked: ParkedItem[]; speakerMap: SpeakerMap; proposals: MeetingProposal[] };
export type CoachState = { currentTopicId: string | null; nextQuestion: string; addressedToPersonId: string | null; stillNeeded: string[]; flags: { kind: string; text: string }[]; remainingMs: number; budgetReached: boolean };
export type FacilitatorTrigger = 'opening' | 'timebox_end' | 'silence' | 'leader_next' | 'slot_empty' | 'closing';
export type FacilitatorAction = 'ASK_QUESTION' | 'ASK_FOLLOW_UP' | 'REQUEST_EXAMPLE' | 'CLARIFY_AMBIGUITY' | 'SUMMARIZE_FINDING' | 'CONFIRM_FINDING' | 'TRANSITION_TOPIC' | 'FLAG_CONTRADICTION' | 'REQUEST_HUMAN_REVIEW' | 'PARK_TOPIC' | 'RECOMMEND_CLOSURE' | 'CLOSE_SESSION';
export type FacilitatorTurn = { text: string; addressedToPersonId?: string; action: FacilitatorAction; promptVersion: string; promptHash: string };
