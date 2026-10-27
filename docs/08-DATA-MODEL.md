# 08 · Data model

Built types live in `seed/shared/hands-free/types.ts`, `seed/mobile/src/types/domain.ts`, `seed/mobile/src/types/handsfree.ts`, `seed/mobile/src/api/generated/companion-mobile-v1.ts` (generated from the contract) and `seed/shared/companion-judgment.ts`. Reuse them. The new types below go in `shared/meetings/types.ts` (pure TypeScript, no zod; the dev server adds zod schemas in `dev-server/src/schemas/`).

Conventions: ids are UUID strings; times are ISO 8601 strings in UTC; durations in milliseconds unless the name says minutes; every server record has `version` (integer, starts at 1) and `hash` (SHA-256 of the canonical JSON) where it can be edited.

## 1. Built (read, do not change shapes)

```ts
// shared/hands-free/types.ts (abridged; read the file for the full set)
type QuestionKey = `question.${number}`;
type QuestionHint = { id: string /* h0, h1, h2 */; label: string /* ≤ 40 */; nudge: string; cues: string[] };
type HandsFreeQuestion = { key: QuestionKey; index: number; text: string; short: string; hints: QuestionHint[]; isElse?: boolean /* …see file */ };
type CardStatus = 'got' | 'saved' | 'skipped';
type SkipReason = 'skip' | 'dontknow' | 'someone';          // dontknow → unknown, someone → wrong_role on submit
type HandsFreeVoiceVia = 'voice_openai' | 'voice_browser' | 'voice_device';
type CardInput = { voice?: HandsFreeVoiceVia; typed?: boolean };
type CardAnswer = { status: CardStatus; raw: string; covered: string[]; reason?: SkipReason; input?: CardInput };
type CoverageResult = { covered: string[]; nudge: string | null; source: 'local' | 'server' };
type UnderstoodAnswer = { key: QuestionKey; understood: string; suggestion: string | null };
// HandsFreeSubmission: text, questionAnswers, questionUnderstood, questionSuggestions, questionResponses, questionAnswerSources, responseText

// contract TaskCardView
type TaskCardView = { id: string; title: string; version: number; hash: string; state: string; needsAttestation: boolean; reviewed: boolean;
  data: { duty?: string; purpose?: string; trigger?: string; inputs?: string; instructions?: string; output?: string; systems?: string[]; humanGate?: string; destination?: string; mode?: string } };
```

`mobile/src/types/domain.ts` already defines the participant-side `Pulse`, `TeamStatus`, `MeetingSummary`, `MeetingDetail`, `MeetingBrief`, `LiveMeetingState`, `Commitment`, `Clarification`, `InterpretationItem`, `ConversationSession` used by the mock screens. Align the new server shapes with them; where they differ, change the mock to match the new server shape and record it.

## 2. New: meetings

```ts
type ParticipantRole = 'decision_maker' | 'influencer' | 'resource' | 'executor' | 'needs_to_know';

type MeetingAttendee = {
  personId: string | null;          // null for a guest
  guest?: { name: string; role: string };  // a guest becomes a *proposed* person
  name: string;
  roles: ParticipantRole[];
};

type MeetingDefinition = {
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

type AgendaTopic = { id: string; title: string; minutes: number; forPersonIds: string[]; questions: string[]; outcomeIds: string[]; async: boolean };

type MeetingGateResult = {
  mode: MeetingMode;                 // 'ASYNC' | 'LIVE' | 'HYBRID' | 'NO_MEETING' | 'INSUFFICIENT_INFO'
  route: 'NO_MEETING' | 'ASYNC' | 'INDIVIDUAL_INTERVIEW' | 'LIVE' | 'HUMAN_LED' | 'HUMAN_ESCALATION';
  reason: string;
  requiredPersonIds: string[]; releasedPersonIds: string[];
  liveMinutes: number | null; asyncTopicIds: string[];
  judgedBy: 'rules' | 'model';       // never shown to participants
};

type MeetingLifecycleState = 'REQUESTED' | 'EVALUATING' | 'ROUTED' | 'PREPARING' | 'READY' | 'IN_SESSION' | 'EXTRACTING'
  | 'REVIEW_PENDING' | 'APPROVED' | 'PARTIALLY_APPROVED' | 'COMPLETE'
  | 'PAUSED' | 'RESCHEDULED' | 'CANCELLED' | 'PARTICIPANT_DISCONNECTED' | 'RECORDING_UNAVAILABLE' | 'CONSENT_WITHDRAWN'
  | 'NEEDS_HUMAN_FACILITATOR' | 'INSUFFICIENT_EVIDENCE' | 'TECHNICAL_FAILURE';
```

## 3. New: sessions, recording, transcript

```ts
type MeetingSession = {
  id: string; meetingId: string; mode: 'capture' | 'copilot' | 'facilitator'; voice: 'tts_lines' | 'realtime' | 'simulated' | null;
  facilitatorState: MeetingFacilitatorState;   // from companion-judgment.ts
  currentTopicId: string | null; topicStartedAt: string | null;
  consents: AttendeeConsent[]; noticeVersion: string; appVersion: string;
  startedAt: string | null; endedAt: string | null;
  promptVersion: string | null; promptHash: string | null;  // from composeFacilitatorPrompt()
  budgetCents: number; spentCents: number;
  log: SessionLogEntry[];                       // append-only
};
type AttendeeConsent = { personKey: string; name: string; state: 'pending' | 'consented' | 'declined'; at: string | null };
type SessionLogEntry = { at: string; actor: 'leader' | 'ai' | 'system'; kind: string; from?: string; to?: string; reason?: string };

type RecordingSegment = { sessionId: string; index: number; startedAt: string; durationMs: number; bytes: number; sha256: string;
  chunks: { index: number; sha256: string; uploaded: boolean }[]; state: 'recording' | 'queued' | 'uploading' | 'uploaded' | 'failed' };

type TranscriptSegment = { id: string; revision: number; sessionId: string; startMs: number; endMs: number; text: string;
  speakerCluster: string | null;     // 'S1', 'S2' … per meeting only; never a voiceprint
  source: 'live' | 'batch'; committed: boolean; excluded?: 'declined_consent' | 'deleted_by_leader' };

type SpeakerMap = { sessionId: string; entries: { cluster: string; personKey: string | null; suggested: boolean; confirmedBy: string | null }[] };
type ParkedItem = { id: string; sessionId: string; text: string; speakerCluster: string | null; atMs: number; followUp: { personId: string; requestId: string | null } | null };
```

## 4. New: proposals and the closing ritual

```ts
type ProposalKind = 'decision' | 'action' | 'open_question' | 'task_card_delta' | 'responsibility_delta' | 'contradiction' | 'claim';
type ProposalState = 'proposed' | 'accepted' | 'rejected' | 'stale';

type SourceRef = { segmentId: string; revision: number; quote: string; speakerCluster: string | null; personKey: string | null };

type MeetingProposal = {
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

type ClosingItem = { proposalId: string; ownerPersonKey: string | null; confirmation: 'pending' | 'confirmed' | 'changed' | 'not_mine'; note?: string };
```

Rules enforced by code: a proposal with an unmapped speaker as its only source cannot be accepted as an attributed claim; editing a segment marks every proposal citing it `stale`; an action is `assigned` only after its owner confirms.

## 5. New: Pulse, kickoff, setup, voice

```ts
type Pulse = { id: string; meetingId: string | null; title: string; dueAt: string; estimateMinutes: number;
  perPerson: { personId: string; questions: HandsFreeQuestion[]; state: 'not_started' | 'in_progress' | 'complete' }[] };
type PulseTeamStatus = { total: number; done: number; people: { name: string; state: 'not_started' | 'in_progress' | 'complete' }[] }; // never answers

type KickoffNote = { id: string; meetingId: string; topicId: 'business' | 'goals' | 'people' | 'duties' | 'tasks' | 'handoffs' | 'systems' | 'followup';
  speakerPersonId: string | null; text: string; at: string };
type ClaimProposal = { fieldPath: string; value: string; quote: string; speakerPersonId: string | null };
type SetupProposal = { fieldPath: string; value: string; quote: string; missingFields: string[]; source: 'owner_supplied' | 'advisor_supplied' };

type SpokenLine = { id: string; text: string; voice: string; speed: number; hash: string; url: string; durationMs: number };

type TaskCardDecision = { taskCardId: string; recordVersion: number; contentHash: string; decision: 'correct' | 'needs_change' | 'not_mine' | 'unsure'; note?: string };
```

## 6. Advisor session

```ts
type AdvisorSession = { accessToken: string; refreshToken: string; accessExpiresAt: string; expiresAt: string;
  advisor: { id: string; name: string }; company: { id: string; name: string }; role: 'advisor_mobile' };
```

Stored in `expo-secure-store` under keys separate from the participant session. One company per session; switching company means pairing again.
