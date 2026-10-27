/**
 * Participant-facing domain model for DutyGraph Companion.
 *
 * This is the logical model from the Companion PRD (section 16) shaped for the
 * phone. Screens and hooks depend only on these types, never on a transport.
 * `src/api/http` maps the pinned `/api/mobile/v1` contract onto them and
 * `src/api/mock` serves fictional fixtures with the same shapes.
 *
 * Rules carried in the types:
 * - No raw Jev scores, confidence percentages or evidence-state terms. The
 *   server translates judgment into plain-language fields before they get here.
 * - A proposal is never canonical. `InterpretationItem.status` and
 *   `GraphDelta.status` start as proposals and only change through the
 *   participant's explicit review.
 */

export type Id = string;
/** ISO-8601 timestamp with offset, e.g. 2026-09-29T10:30:00-04:00 */
export type IsoDateTime = string;

// ---------------------------------------------------------------------------
// Participant
// ---------------------------------------------------------------------------

export interface NotificationPreferences {
  pulseReady: boolean;
  meetingChanges: boolean;
  commitmentsDue: boolean;
  /** Hold non-urgent notifications during quiet hours. */
  quietHours: boolean;
}

export interface VoicePreferences {
  /** Open answers with the microphone when the participant has consented. */
  voiceFirst: boolean;
  /** Show the live transcript while speaking. */
  showTranscript: boolean;
  /** Read DutyGraph's questions aloud (TTS) where the server provides audio. */
  speakQuestions: boolean;
}

export type AppearancePreference = 'system' | 'dark' | 'light';

export interface Participant {
  id: Id;
  companyId: Id;
  companyName: string;
  displayName: string;
  firstName: string;
  roleTitle?: string;
  timezone: string;
  notificationPreferences: NotificationPreferences;
  voicePreferences: VoicePreferences;
}

// ---------------------------------------------------------------------------
// Participation requests (the Today inbox)
// ---------------------------------------------------------------------------

export type RequestType =
  | 'PULSE'
  | 'DISCOVERY'
  | 'CONFIRMATION'
  | 'DECISION'
  | 'APPROVAL'
  | 'CLARIFICATION'
  | 'MEETING';

/** Factual states only (PRD 3.7): no streaks, rankings or scores. */
export type RequestStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'REVIEW' | 'COMPLETE';

export type Urgency = 'NONE' | 'DUE_SOON' | 'DUE' | 'OVERDUE';

export interface ParticipationRequest {
  id: Id;
  type: RequestType;
  title: string;
  /** One line under the title: "4 questions · about 4 min". */
  summary: string;
  /** Why the request exists, in plain language ("Why am I being asked?"). */
  reason: string;
  estimatedMinutes?: number;
  dueAt?: IsoDateTime;
  status: RequestStatus;
  /** Primary call to action label, e.g. "Start Pulse". */
  cta: string;
  /** In-app route the card opens. Matches the notification deep link. */
  route: string;
  sourceEntityType?: 'PULSE' | 'MEETING' | 'CLARIFICATION' | 'DISCOVERY' | 'COMMITMENT' | 'DECISION';
  sourceEntityId?: Id;
  createdAt: IsoDateTime;
  completedAt?: IsoDateTime;
}

export interface MeetingBanner {
  meetingId: Id;
  title: string;
  body: string;
  route: string;
}

export interface TodayFeed {
  participant: Pick<Participant, 'id' | 'displayName' | 'firstName'>;
  /** Server "now" used for greeting and due calculations. */
  asOf: IsoDateTime;
  /** e.g. "You don't need to join the 11:00 meeting". */
  banner?: MeetingBanner;
  dueNow: ParticipationRequest[];
  later: ParticipationRequest[];
  doneToday: { id: Id; title: string; completedAt: IsoDateTime }[];
}

// ---------------------------------------------------------------------------
// Pulse
// ---------------------------------------------------------------------------

export type PulseParticipantStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETE' | 'DUE_SOON' | 'OVERDUE';

export interface Pulse {
  id: Id;
  requestId: Id;
  title: string;
  purpose: string;
  desiredOutcome: string;
  dueAt: IsoDateTime;
  questionCount: number;
  estimatedMinutes: number;
  /** The participant's own status. */
  status: RequestStatus;
  /** Plain-language explanation for the "Why am I being asked this?" sheet. */
  whyAsked: string[];
  replacesMeeting?: { meetingId: Id; title: string; startsAt: IsoDateTime; durationMinutes: number };
  /** True when the server allows this participant to see team completion. */
  teamStatusVisible: boolean;
}

export interface TeamStatusRow {
  participantId: Id;
  displayName: string;
  isYou: boolean;
  status: PulseParticipantStatus;
}

/** Completion metadata only. Never other people's answers (PRD 8.4). */
export interface TeamStatus {
  pulseId: Id;
  title: string;
  dueAt: IsoDateTime;
  completeCount: number;
  totalCount: number;
  note: string;
  rows: TeamStatusRow[];
  meetingOutcome?: MeetingBanner;
}

// ---------------------------------------------------------------------------
// Conversation (PRD 12, 15)
// ---------------------------------------------------------------------------

export type ConversationMode =
  | 'PULSE'
  | 'DISCOVERY'
  | 'CLARIFICATION'
  | 'CHANGE_REPORT'
  | 'CONFIRMATION'
  | 'MEETING_WRAP_UP';

/** Server-owned generic async state machine (PRD 12.1). */
export type ConversationState =
  | 'CREATED'
  | 'READY'
  | 'ACTIVE'
  | 'PROCESSING_TURN'
  | 'FOLLOW_UP'
  | 'NEXT_TOPIC'
  | 'REVIEW_READY'
  | 'REVIEWING'
  | 'SUBMITTING'
  | 'SUBMITTED'
  | 'MIC_ERROR'
  | 'OFFLINE_DRAFT'
  | 'PROVIDER_ERROR'
  | 'SUBMISSION_FAILED';

export type Speaker = 'PARTICIPANT' | 'DUTYGRAPH';
export type UtteranceSource = 'VOICE' | 'TEXT' | 'SYSTEM';

export interface Utterance {
  /** Stable id. Client-generated for participant turns so retries never duplicate. */
  id: Id;
  sessionId: Id;
  speaker: Speaker;
  text: string;
  sequence: number;
  final: boolean;
  source: UtteranceSource;
  /** DutyGraph turns only: "follow" marks a follow-up rather than a new topic. */
  kind?: 'QUESTION' | 'FOLLOW_UP' | 'ACKNOWLEDGEMENT';
}

export interface ConversationProgress {
  /** 1-based topic number, e.g. "Question 2 of 4". */
  current: number;
  total: number;
}

export interface ConversationSession {
  id: Id;
  requestId: Id;
  mode: ConversationMode;
  title: string;
  state: ConversationState;
  /** Prompt-pack version the server used, for audit and reproducibility. */
  promptVersion: string;
  progress: ConversationProgress;
  utterances: Utterance[];
  /** Opening line for the intro screen. */
  opening?: string;
  /** What the conversation belongs to; drives routing after review. */
  source?: { type: 'PULSE' | 'MEETING' | 'CLARIFICATION' | 'DISCOVERY' | 'CHANGE_REPORT' | 'CONFIRMATION'; id: Id };
  startedAt: IsoDateTime;
  endedAt?: IsoDateTime;
}

export interface TurnInput {
  sessionId: Id;
  /** Client-generated utterance id; doubles as the idempotency key for the turn. */
  utteranceId: Id;
  text: string;
  source: 'VOICE' | 'TEXT';
}

export interface TurnResult {
  session: ConversationSession;
  /** True when the server judged the conversation complete and review is ready. */
  reviewReady: boolean;
}

// ---------------------------------------------------------------------------
// Review: "Here's what we understood"
// ---------------------------------------------------------------------------

export type InterpretationStatus = 'PENDING' | 'CONFIRMED' | 'CHANGED' | 'REJECTED';

export interface InterpretationItem {
  id: Id;
  sessionId: Id;
  category: string;
  /** Uppercase label on the card, e.g. "New blocker". */
  label: string;
  proposedText: string;
  participantEditedText?: string;
  status: InterpretationStatus;
  sourceUtteranceIds: Id[];
  /** Server-authorized actions for this item (PRD 21). */
  allowedActions: ('CONFIRM' | 'CHANGE' | 'REJECT')[];
  /** Button copy overrides for wrap-up items ("Accept", "Confirm"). */
  confirmLabel?: string;
  confirmedLabel?: string;
  /** Participant-added item (not proposed by DutyGraph). */
  addedByParticipant?: boolean;
}

export interface ReviewCopy {
  chip: string;
  title: string;
  subtitle: string;
  submitLabel: string;
}

export interface Review {
  sessionId: Id;
  mode: ConversationMode;
  copy: ReviewCopy;
  items: InterpretationItem[];
  /** Participant may add an item DutyGraph missed. */
  canAddItems: boolean;
}

export interface SubmitInput {
  sessionId: Id;
  /** Required. Same key + same body returns the saved result (PRD 27). */
  idempotencyKey: string;
  /** The reviewed version, not the original interpretation. */
  items: InterpretationItem[];
}

export interface SubmitResult {
  sessionId: Id;
  acknowledgedAt: IsoDateTime;
  /** Plain-language completion copy for the done screen. */
  headline: string;
  body: string;
  /** Where to go next: team status for a Pulse, Work for a wrap-up, etc. */
  nextRoute?: string;
  createdCommitmentIds?: Id[];
  proposedGraphDeltaIds?: Id[];
}

// ---------------------------------------------------------------------------
// Meetings (PRD 19-21)
// ---------------------------------------------------------------------------

export type MeetingOutcomeKind = 'AVOIDED' | 'SHORTENED' | 'REQUIRED' | 'PENDING' | 'ASYNC' | 'COMPLETED';

export interface MeetingSummary {
  id: Id;
  title: string;
  /** Group on the Meetings tab. */
  group: 'ASYNC' | 'TODAY' | 'UPCOMING' | 'RECENT';
  whenLabel: string;
  startsAt?: IsoDateTime;
  outcome: MeetingOutcomeKind;
  statusLine: string;
  tone: 'sage' | 'amber' | 'violet' | 'plain';
  route: string;
}

export interface MeetingJoinTarget {
  provider: 'GOOGLE_MEET' | 'TEAMS' | 'ZOOM' | 'PHONE' | 'IN_PERSON' | 'OTHER';
  label: string;
  url?: string;
}

export interface MeetingDetail {
  id: Id;
  title: string;
  outcome: MeetingOutcomeKind;
  startsAt?: IsoDateTime;
  endsAt?: IsoDateTime;
  originalDurationMinutes?: number;
  newDurationMinutes?: number;
  /** "50 minutes returned to you" (personal only; no company cost analytics). */
  minutesReturned?: number;
  headline: string;
  reason: string;
  purpose?: string;
  expectedOutcome?: string;
  whyYou?: string;
  yourRole?: string;
  issue?: string;
  joinTarget?: MeetingJoinTarget;
  summary?: string[];
  hasBrief: boolean;
  hasWrapUp: boolean;
}

export interface MeetingBrief {
  meetingId: Id;
  title: string;
  whenLabel: string;
  durationMinutes: number;
  purpose: string;
  expectedOutcome: string;
  whyYou: string;
  alreadyKnown: string[];
  openQuestions: string[];
  mayAskYou: string[];
  decisionAuthority?: string;
  joinTarget?: MeetingJoinTarget;
}

/** Post-MVP live companion view. Rendered read-only from server state. */
export interface LiveMeetingState {
  meetingId: Id;
  title: string;
  endsAt: IsoDateTime;
  currentQuestion: string;
  purpose: string;
  decisionOwner?: string;
  parkingLot: string[];
  recentTranscript: string[];
  closeReady: boolean;
}

// ---------------------------------------------------------------------------
// Work (PRD 16.8)
// ---------------------------------------------------------------------------

export type CommitmentStatus = 'OPEN' | 'COMPLETE' | 'WAITING' | 'CANCELLED';

export interface Commitment {
  id: Id;
  kind: 'COMMITMENT' | 'WAITING_ON';
  title: string;
  outcome: string;
  dueAt?: IsoDateTime;
  /** Human due line: "Due today · 4:00 PM" or "Owner: Samir Patel, IT". */
  dueLabel: string;
  authority?: string;
  constraints?: string;
  definitionOfDone?: string;
  why?: string;
  status: CommitmentStatus;
  sourceType: 'PULSE' | 'MEETING' | 'DISCOVERY' | 'CHANGE_REPORT' | 'MANUAL';
  sourceId?: Id;
  sourceLabel: string;
  waitingOn?: { displayName: string; team?: string };
  latest?: string;
  whatHappensNext?: string;
  /** Server-authorized: whether the participant may mark this complete. */
  canComplete: boolean;
  completedAt?: IsoDateTime;
}

export interface WorkList {
  today: Commitment[];
  thisWeek: Commitment[];
  later: Commitment[];
  waiting: Commitment[];
  done: Commitment[];
}

// ---------------------------------------------------------------------------
// Continuous discovery (PRD 16.10, 16.11, 22)
// ---------------------------------------------------------------------------

export interface ClarificationOption {
  id: Id;
  label: string;
  /** Selecting this option needs a short conversation ("It's more complicated"). */
  opensConversation?: boolean;
}

export interface Clarification {
  id: Id;
  requestId: Id;
  prompt: string;
  context: string;
  existingStatement?: { text: string; source: string };
  conflictingStatement?: { text: string; source: string };
  options: ClarificationOption[];
  status: 'OPEN' | 'RESOLVED';
  resolvedLabel?: string;
}

export type ChangeKind =
  | 'RESPONSIBILITIES'
  | 'PROCESS'
  | 'OWNER'
  | 'NEW_SOFTWARE'
  | 'STOPPED_TASK'
  | 'APPROVAL_STEP'
  | 'OTHER';

export interface ChangeKindOption {
  kind: ChangeKind;
  label: string;
}

export type GraphDeltaType = 'TASK' | 'RESPONSIBILITY' | 'SYSTEM' | 'WORKFLOW' | 'ROLE' | 'OTHER';

/** A proposed DutyGraph change. Never canonical until reviewed server-side. */
export interface GraphDelta {
  id: Id;
  type: GraphDeltaType;
  proposedChange: string;
  sourceIds: Id[];
  status: 'PROPOSED' | 'CONFIRMED' | 'REJECTED' | 'REQUIRES_REVIEW';
}

export interface DiscoveryRequest {
  id: Id;
  requestId: Id;
  title: string;
  intro: string;
  questionCount: number;
  estimatedMinutes: number;
  dueAt?: IsoDateTime;
  whyAsked: string[];
}

// ---------------------------------------------------------------------------
// Notifications (PRD 24)
// ---------------------------------------------------------------------------

export type NotificationKind =
  | 'PULSE_READY'
  | 'MEETING_AVOIDED'
  | 'MEETING_SHORTENED'
  | 'CLARIFICATION'
  | 'COMMITMENT_REMINDER'
  | 'FOLLOW_UP'
  | 'DISCOVERY';

export interface AppNotification {
  id: Id;
  kind: NotificationKind;
  typeLabel: string;
  title: string;
  body: string;
  timeLabel: string;
  /** Exact in-app route. Push payloads carry the same value. */
  route: string;
  read: boolean;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Mirrors the server error envelope `{ code, message, retryable, requestId }`. */
export class CompanionApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly retryable: boolean,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'CompanionApiError';
  }
}
