import type {
  AppNotification,
  ChangeKind,
  ChangeKindOption,
  Clarification,
  Commitment,
  ConversationMode,
  ConversationSession,
  DiscoveryRequest,
  Id,
  LiveMeetingState,
  MeetingBrief,
  MeetingDetail,
  MeetingSummary,
  Participant,
  Pulse,
  Review,
  InterpretationItem,
  SubmitInput,
  SubmitResult,
  TeamStatus,
  TodayFeed,
  TurnInput,
  TurnResult,
  WorkList,
  NotificationPreferences,
  VoicePreferences,
} from '@/types/domain';
import type {
  CoverageCheckInput,
  QuestionSet,
  ServerCoverage,
  SubmitAnswersInput,
  SubmitAnswersResult,
  UnderstandInput,
  UnderstandResult,
} from '@/types/handsfree';

/**
 * The only data boundary screens use. Two implementations:
 *
 * - `MockCompanionRepository` (src/api/mock): fictional fixtures and a scripted
 *   conversation engine. Default in development and for design review.
 * - `HttpCompanionRepository` (src/api/http): the pinned `/api/mobile/v1`
 *   contract. Operations the server has not built yet throw
 *   `CompanionApiError('NOT_AVAILABLE', ...)` so screens show an honest
 *   "not available yet" state rather than invented data.
 *
 * The server owns canonical conversation state, authorization and
 * completion. The client renders what it returns and never marks anything
 * complete until a call resolves (PRD 27, rule 10).
 */
export interface CompanionRepository {
  readonly kind: 'mock' | 'http';

  // Identity
  enroll(invitationToken: string, idempotencyKey: string): Promise<Participant>;
  getMe(): Promise<Participant>;
  updatePreferences(patch: {
    notificationPreferences?: Partial<NotificationPreferences>;
    voicePreferences?: Partial<VoicePreferences>;
  }): Promise<Participant>;
  logout(): Promise<void>;

  // Today and notifications
  getToday(): Promise<TodayFeed>;
  getNotifications(): Promise<AppNotification[]>;
  markNotificationsRead(): Promise<void>;

  // Pulse
  getPulse(pulseId: Id): Promise<Pulse>;
  getTeamStatus(pulseId: Id): Promise<TeamStatus>;

  // Conversation (Pulse, Discovery, Clarification, Something Changed)
  startConversation(input: {
    requestId: Id;
    mode: ConversationMode;
    /** Something Changed: the participant's chosen kind seeds the first question. */
    changeKind?: ChangeKind;
    /** Clarification: the option that opened the conversation. */
    clarificationOptionId?: Id;
  }): Promise<ConversationSession>;
  getConversation(sessionId: Id): Promise<ConversationSession>;
  sendTurn(input: TurnInput): Promise<TurnResult>;
  /**
   * Server-side transcription of one recorded answer clip
   * (contract: POST /requests/{requestId}/transcriptions). Live streaming is
   * not available on the server yet (501), so voice answers are recorded,
   * uploaded when the participant taps "Done answering", and the transcript
   * is shown for review before the turn is sent.
   */
  transcribeClip(input: { sessionId: Id; uri: string; mimeType: string; durationMs: number }): Promise<{ text: string }>;
  /** Participant ended early; server decides whether review is possible. */
  stopConversation(sessionId: Id): Promise<ConversationSession>;
  getReview(sessionId: Id): Promise<Review>;
  updateReviewItem(sessionId: Id, item: InterpretationItem): Promise<InterpretationItem>;
  submitReview(input: SubmitInput): Promise<SubmitResult>;

  // Meetings
  getMeetings(): Promise<MeetingSummary[]>;
  getMeeting(meetingId: Id): Promise<MeetingDetail>;
  getMeetingBrief(meetingId: Id): Promise<MeetingBrief>;
  getLiveMeeting(meetingId: Id): Promise<LiveMeetingState>;
  /** Starts a wrap-up review session for the meeting outcome. */
  startWrapUp(meetingId: Id): Promise<ConversationSession>;

  // Work
  getWork(): Promise<WorkList>;
  getCommitment(commitmentId: Id): Promise<Commitment>;
  completeCommitment(commitmentId: Id, idempotencyKey: string): Promise<Commitment>;

  // Continuous discovery
  getClarification(clarificationId: Id): Promise<Clarification>;
  /** One-tap resolution. Options with `opensConversation` use startConversation instead. */
  respondToClarification(clarificationId: Id, optionId: Id, idempotencyKey: string): Promise<SubmitResult>;
  getChangeKinds(): Promise<ChangeKindOption[]>;
  /** Creates the Something Changed request the conversation attaches to. */
  createChangeReport(kind: ChangeKind): Promise<{ requestId: Id }>;
  getDiscoveryRequest(requestId: Id): Promise<DiscoveryRequest>;

  // Hands-free question cards (docs/specs/COMPANION-HANDS-FREE.md, contract 1.2)
  /** The request's questions with their "Try to cover" hints, plus the "Anything else?" card. */
  getQuestionSet(requestId: Id): Promise<QuestionSet>;
  /** Server "is this enough?" check. Never throws for a missing AI connection: returns available false. */
  checkCoverage(input: CoverageCheckInput): Promise<ServerCoverage>;
  /** "Here's what we heard": polished answers, or available false to show the person's words. */
  understandAnswers(input: UnderstandInput): Promise<UnderstandResult>;
  /** Sends the reviewed answers in the web team page's shape. Idempotent by key. */
  submitAnswers(input: SubmitAnswersInput): Promise<SubmitAnswersResult>;
}
