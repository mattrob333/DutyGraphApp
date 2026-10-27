/**
 * In-memory, fictional implementation of CompanionRepository.
 *
 * It behaves like the server on the points that matter for the UI:
 * - the server owns turn order and decides when review is ready;
 * - participant turns are idempotent by utterance id;
 * - submission is idempotent by key and only resolves after a simulated
 *   acknowledgement, so the app never shows completion early;
 * - team status shows completion metadata only.
 *
 * All names, companies and events are fictional, taken from the Claude Design
 * prototype: Noah Reed at Cobalt answering Alex Rivera's questions (the default
 * `questions` scope), and Dana Okafor at a fictional North Dock operation (the
 * `full` scope, PR #48's Pulse, meetings and work).
 */
import type { CompanionRepository } from '../repository';
import {
  CompanionApiError,
  type AppNotification,
  type ChangeKind,
  type ChangeKindOption,
  type Clarification,
  type Commitment,
  type ConversationMode,
  type ConversationSession,
  type DiscoveryRequest,
  type Id,
  type InterpretationItem,
  type LiveMeetingState,
  type MeetingBrief,
  type MeetingDetail,
  type MeetingSummary,
  type Participant,
  type ParticipationRequest,
  type Pulse,
  type Review,
  type SubmitInput,
  type SubmitResult,
  type TeamStatus,
  type TodayFeed,
  type TurnInput,
  type TurnResult,
  type Utterance,
  type WorkList,
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
import { buildQuestions, minutesFor } from '@shared/hands-free/hints';
import { hasSomethingToSend } from '@shared/hands-free/submission';
import { simulationFlags } from '@/state/simulation';
import { clearAllDrafts } from '@/features/handsfree/draft';
import { atLocal, formatClock } from '@/utils/time';
import { config, type CompanionScope } from '../config';
import { HF_IDS, MOCK_QUESTION_REQUESTS, dueDateFor, mockQuestionRequest, mockUnderstood, type MockQuestionRequest } from './handsFree';
import {
  DONE_COPY,
  INTERPRETATIONS,
  REVIEW_COPY,
  SCRIPTS,
  VAGUE_FOLLOW_UP,
  VAGUE_WORD_THRESHOLD,
  type ConversationScript,
} from './scripts';

export const MOCK_IDS = {
  pulse: 'pulse-monday-ops',
  pulseRequest: 'req-pulse-monday',
  confirmRequest: 'req-confirm-friday',
  clarification: 'clar-invoice-exceptions',
  clarificationRequest: 'req-clar-invoice',
  discoveryRequest: HF_IDS.northDock,
  handsFree: HF_IDS.cobalt,
  handsFreeRecords: HF_IDS.cobaltRecords,
  meetingStatus: 'mtg-ops-status',
  meetingReview: 'mtg-project-review',
  meetingFriday: 'mtg-ops-review-friday',
  decisionVendor: 'dec-vendor-rollout',
} as const;

const PROMPT_VERSION = 'companion-prompts@2026-09-29.1 (mock)';
const TEAM = [
  'John Carter', 'Maya Chen', 'Nate Davis', 'Sarah Kim', 'Amara Nwosu', 'Dana Okafor',
  'Tom Reyes', 'Luis Romero', 'Priya Shah', 'Jesse Sherrill', 'Ben Walsh',
];
const DONE_ORDER = [
  'Jesse Sherrill', 'Nate Davis', 'Sarah Kim', 'Priya Shah', 'Luis Romero',
  'Amara Nwosu', 'Ben Walsh', 'Maya Chen', 'Tom Reyes', 'John Carter',
];

interface SessionRecord {
  session: ConversationSession;
  mode: ConversationMode;
  script?: ConversationScript;
  /** Index into script.turns of the question currently awaiting an answer. */
  idx: number;
  /** Turn indexes where the engine already asked the generic clarifying follow-up. */
  vagueAsked: Set<number>;
  items: InterpretationItem[];
  submitted?: { key: string; result: SubmitResult };
}

export type MockEvent = { type: 'meeting_avoided'; meetingId: Id } | { type: 'team_progress'; done: number };

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const DANA: Participant = {
  id: 'p-dana',
  companyId: 'co-northwind-logistics',
  companyName: 'Northwind Logistics (fictional)',
  displayName: 'Dana Okafor',
  firstName: 'Dana',
  roleTitle: 'Operations Coordinator · North Dock',
  timezone: 'America/New_York',
  notificationPreferences: { pulseReady: true, meetingChanges: true, commitmentsDue: true, quietHours: true },
  voicePreferences: { voiceFirst: true, showTranscript: true, speakQuestions: false },
};
const NOAH: Participant = {
  ...DANA,
  id: 'p-noah',
  companyId: 'co-cobalt',
  companyName: 'Cobalt',
  displayName: 'Noah Reed',
  firstName: 'Noah',
  roleTitle: 'Order Coordinator',
};
/** Fake request version and content hash (64 hex characters, like the server's). */
const HF_VERSION = 1;
const hfHash = (requestId: string) => [...requestId].reduce((h, ch) => h + ch.charCodeAt(0).toString(16), '').padEnd(64, '0').slice(0, 64);

export class MockCompanionRepository implements CompanionRepository {
  readonly kind = 'mock' as const;
  /** Multiplier for simulated latency; tests set 0. */
  latency = 1;

  private flags = {
    pulseDone: false,
    confirmDone: false,
    clarifyDone: false,
    discDone: false,
    changedDone: false,
    wrapDone: false,
    avoidedKnown: false,
  };
  private clarifyResolvedLabel?: string;
  private teamDone = 7;
  private teamTimer?: ReturnType<typeof setInterval>;
  private completed = new Set<Id>();
  private sessions = new Map<Id, SessionRecord>();
  private changeSeq = 0;
  private notificationsRead = false;
  private listeners = new Set<(e: MockEvent) => void>();
  private idempotentCompletions = new Map<string, Commitment>();
  /** Hands-free submissions by request id, with the key that sent them. */
  private hfSent = new Map<Id, { key: string; result: SubmitAnswersResult; at: string; submission: SubmitAnswersInput['submission'] }>();
  private readonly scope: CompanionScope;
  private participant: Participant;

  constructor(opts: { scope?: CompanionScope } = {}) {
    this.scope = opts.scope ?? config.companionScope;
    this.participant = clone(this.scope === 'full' ? DANA : NOAH);
  }

  // -------------------------------------------------------------------------
  // Test and demo helpers (mock only)
  // -------------------------------------------------------------------------

  subscribe(listener: (e: MockEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Sample answer the simulated microphone "hears" for the current question. */
  sampleAnswerFor(sessionId: Id): string {
    const rec = this.sessions.get(sessionId);
    if (!rec?.script) return '';
    return rec.script.turns[rec.idx]?.sampleAnswer ?? '';
  }

  reset() {
    if (this.teamTimer) clearInterval(this.teamTimer);
    this.teamTimer = undefined;
    this.flags = { pulseDone: false, confirmDone: false, clarifyDone: false, discDone: false, changedDone: false, wrapDone: false, avoidedKnown: false };
    this.clarifyResolvedLabel = undefined;
    this.teamDone = 7;
    this.completed.clear();
    this.sessions.clear();
    this.notificationsRead = false;
    this.idempotentCompletions.clear();
    this.hfSent.clear();
  }

  private emit(e: MockEvent) {
    this.listeners.forEach((l) => l(e));
  }

  private async net(ms = 450) {
    await delay(ms * this.latency);
    const f = simulationFlags();
    if (f.offline) {
      throw new CompanionApiError('NETWORK_OFFLINE', "You're offline. Your work is kept on this phone.", 0, true);
    }
  }

  // -------------------------------------------------------------------------
  // Identity
  // -------------------------------------------------------------------------

  async enroll(invitationToken: string): Promise<Participant> {
    await this.net(700);
    if (!invitationToken.trim()) throw new CompanionApiError('INVITATION_EXPIRED', 'This invitation link has expired or was already used.', 410, false);
    return clone(this.participant);
  }

  async getMe(): Promise<Participant> {
    await this.net(150);
    return clone(this.participant);
  }

  async updatePreferences(patch: Parameters<CompanionRepository['updatePreferences']>[0]): Promise<Participant> {
    await this.net(200);
    this.participant = {
      ...this.participant,
      notificationPreferences: { ...this.participant.notificationPreferences, ...patch.notificationPreferences },
      voicePreferences: { ...this.participant.voicePreferences, ...patch.voicePreferences },
    };
    return clone(this.participant);
  }

  async logout(): Promise<void> {
    await delay(100 * this.latency);
    // Hands-free drafts hold the person's own words: they leave the phone with the session.
    await clearAllDrafts();
  }

  // -------------------------------------------------------------------------
  // Today
  // -------------------------------------------------------------------------

  async getToday(): Promise<TodayFeed> {
    await this.net(350);
    const now = new Date();
    const f = this.flags;
    const pulseDue = simulationFlags().pulseOverdue ? atLocal(8, 30) : atLocal(10, 30);
    const dueNow: ParticipationRequest[] = [];
    const later: ParticipationRequest[] = [];
    const base = { createdAt: atLocal(8, 0).toISOString() };

    if (!f.pulseDone)
      dueNow.push({
        ...base,
        id: MOCK_IDS.pulseRequest,
        type: 'PULSE',
        title: 'Monday Operations Pulse',
        summary: '4 questions · about 4 min',
        reason: "Replaces this week's 60-minute status meeting.",
        estimatedMinutes: 4,
        dueAt: pulseDue.toISOString(),
        status: this.sessionInProgress('PULSE') ? 'IN_PROGRESS' : 'NOT_STARTED',
        cta: this.sessionInProgress('PULSE') ? 'Continue Pulse' : 'Start Pulse',
        route: `/pulse/${MOCK_IDS.pulse}`,
        sourceEntityType: 'PULSE',
        sourceEntityId: MOCK_IDS.pulse,
      });
    if (!f.confirmDone)
      dueNow.push({
        ...base,
        id: MOCK_IDS.confirmRequest,
        type: 'CONFIRMATION',
        title: 'Confirm what we understood',
        summary: "2 items from Friday's Operations Review",
        reason: 'DutyGraph needs your confirmation before it records these as yours.',
        estimatedMinutes: 1,
        status: 'NOT_STARTED',
        cta: 'Review',
        route: `/confirmations/${MOCK_IDS.confirmRequest}`,
        sourceEntityType: 'MEETING',
        sourceEntityId: MOCK_IDS.meetingFriday,
      });
    if (!f.clarifyDone)
      dueNow.push({
        ...base,
        id: MOCK_IDS.clarificationRequest,
        type: 'CLARIFICATION',
        title: 'Who owns invoice exceptions?',
        summary: 'Two answers disagree. One tap should settle it.',
        reason: 'Your earlier answer and the current process record disagree.',
        estimatedMinutes: 1,
        status: 'NOT_STARTED',
        cta: 'Help clarify',
        route: `/clarifications/${MOCK_IDS.clarification}`,
        sourceEntityType: 'CLARIFICATION',
        sourceEntityId: MOCK_IDS.clarification,
      });
    if (!f.wrapDone)
      later.push({
        ...base,
        id: 'req-meeting-review',
        type: 'MEETING',
        title: 'Your 2:00 review is now 15 minutes',
        summary: "You're needed for one decision.",
        reason: "This morning's Pulses resolved most of the agenda.",
        status: 'NOT_STARTED',
        cta: 'See why',
        route: `/meetings/${MOCK_IDS.meetingReview}/shortened`,
        sourceEntityType: 'MEETING',
        sourceEntityId: MOCK_IDS.meetingReview,
      });
    for (const r of this.questionRequests()) {
      if (this.hfSent.has(r.requestId) || (r.requestId === MOCK_IDS.discoveryRequest && f.discDone)) continue;
      const card = this.questionCard(r, now, base.createdAt);
      if (r.later) later.push(card);
      else dueNow.unshift(card);
    }
    later.push({
      ...base,
      id: 'req-decision-vendor',
      type: 'DECISION',
      title: 'Vendor rollout decision',
      summary: "You may be needed if Engineering can't resolve one open question.",
      reason:
        "Engineering is choosing between two carrier-integration vendors this week. One open question — whether Northline's API supports same-day rebooking — may need your input. If Engineering answers it themselves, you won't hear from us.",
      status: 'NOT_STARTED',
      cta: 'View context',
      route: '',
      sourceEntityType: 'DECISION',
      sourceEntityId: MOCK_IDS.decisionVendor,
    });

    const doneToday: TodayFeed['doneToday'] = [];
    const push = (flag: boolean, id: string, title: string) => flag && doneToday.push({ id, title, completedAt: now.toISOString() });
    push(f.pulseDone, 'done-pulse', 'Monday Operations Pulse');
    push(f.confirmDone, 'done-confirm', "Friday's review confirmed");
    push(f.clarifyDone, 'done-clarify', 'Invoice exceptions clarified');
    push(f.discDone, 'done-disc', 'North dock discovery');
    push(f.changedDone, 'done-changed', 'Workflow change reported');
    push(f.wrapDone, 'done-wrap', 'NetSuite meeting outcome');
    for (const [id, sent] of this.hfSent) doneToday.push({ id: `done-${id}`, title: mockQuestionRequest(id)?.title ?? 'Questions answered', completedAt: sent.at });
    doneToday.push({ id: 'done-security', title: 'Security acknowledgment', completedAt: atLocal(8, 12).toISOString() });

    return {
      participant: { id: this.participant.id, displayName: this.participant.displayName, firstName: this.participant.firstName },
      asOf: now.toISOString(),
      banner: f.avoidedKnown
        ? {
            meetingId: MOCK_IDS.meetingStatus,
            title: "You don't need to join the 11:00 meeting",
            body: '50 minutes returned to you',
            route: `/meetings/${MOCK_IDS.meetingStatus}/avoided`,
          }
        : undefined,
      dueNow,
      later,
      doneToday,
    };
  }

  /** Question requests for this scope: Cobalt's in both, the north dock one only with the full app. */
  private questionRequests(): MockQuestionRequest[] {
    return MOCK_QUESTION_REQUESTS.filter((r) => this.scope === 'full' || r.requestId !== MOCK_IDS.discoveryRequest);
  }

  private questionCard(r: MockQuestionRequest, now: Date, createdAt: string): ParticipationRequest {
    const n = r.questions.length;
    const minutes = minutesFor(n);
    const [y, m, d] = dueDateFor(r, now).split('-').map(Number);
    return {
      id: r.requestId,
      type: 'DISCOVERY',
      title: r.title,
      summary: `${r.advisorName ? `From ${r.advisorName} · ` : ''}${n} ${n === 1 ? 'question' : 'questions'} · about ${minutes} min`,
      reason: r.whyAsked[0],
      estimatedMinutes: minutes,
      // The end of the due day, as the HTTP mapping does, so Today and the intro agree.
      dueAt: new Date(y, m - 1, d, 23, 59, 59).toISOString(),
      status: 'NOT_STARTED',
      cta: 'Start',
      route: `/questions/${r.requestId}`,
      sourceEntityType: 'DISCOVERY',
      sourceEntityId: r.requestId,
      createdAt,
    };
  }

  private sessionInProgress(mode: ConversationMode): boolean {
    for (const r of this.sessions.values()) if (r.mode === mode && !r.submitted) return true;
    return false;
  }

  async getNotifications(): Promise<AppNotification[]> {
    await this.net(250);
    const read = this.notificationsRead;
    const n = (x: Omit<AppNotification, 'read'>): AppNotification => ({ ...x, read });
    const cobalt = MOCK_QUESTION_REQUESTS[0];
    const count = cobalt.questions.length;
    return [
      n({ id: 'n0', kind: 'DISCOVERY', typeLabel: 'Questions', title: `${cobalt.advisorName} has ${count} questions for you`, body: `About ${minutesFor(count)} minutes`, timeLabel: '9:00 AM', route: `/questions/${cobalt.requestId}` }),
      n({ id: 'n1', kind: 'PULSE_READY', typeLabel: 'Pulse', title: 'Your Monday Operations Pulse is ready', body: 'About 4 minutes · due 10:30 AM', timeLabel: '8:02 AM', route: `/pulse/${MOCK_IDS.pulse}` }),
      n({ id: 'n2', kind: 'MEETING_AVOIDED', typeLabel: 'Meeting avoided', title: "You're no longer needed at the 11:00 meeting", body: 'Your Pulse covered everything the team needed.', timeLabel: 'After Pulses', route: `/meetings/${MOCK_IDS.meetingStatus}/avoided` }),
      n({ id: 'n3', kind: 'MEETING_SHORTENED', typeLabel: 'Meeting shortened', title: "You're needed for 15 minutes at 2:00", body: 'One decision remains unresolved.', timeLabel: 'After Pulses', route: `/meetings/${MOCK_IDS.meetingReview}/shortened` }),
      n({ id: 'n4', kind: 'CLARIFICATION', typeLabel: 'Clarification', title: 'DutyGraph found conflicting information', body: 'Can you help clarify who owns invoice exceptions?', timeLabel: '7:45 AM', route: `/clarifications/${MOCK_IDS.clarification}` }),
      n({ id: 'n5', kind: 'COMMITMENT_REMINDER', typeLabel: 'Commitment', title: 'Due at 4:00 PM', body: 'Confirm carrier cutoff times.', timeLabel: '7:30 AM', route: '/work/commitments/c-cutoff' }),
      n({ id: 'n6', kind: 'FOLLOW_UP', typeLabel: 'Follow-up', title: 'Did this get finished?', body: "DutyGraph hasn't seen confirmation that the revised dock schedule reached Jesse.", timeLabel: 'Friday', route: `/pulse/${MOCK_IDS.pulse}` }),
    ];
  }

  async markNotificationsRead(): Promise<void> {
    await delay(50 * this.latency);
    this.notificationsRead = true;
  }

  // -------------------------------------------------------------------------
  // Pulse
  // -------------------------------------------------------------------------

  async getPulse(pulseId: Id): Promise<Pulse> {
    await this.net(250);
    if (pulseId !== MOCK_IDS.pulse) throw new CompanionApiError('NOT_FOUND', 'This Pulse is no longer available.', 404, false);
    return {
      id: MOCK_IDS.pulse,
      requestId: MOCK_IDS.pulseRequest,
      title: 'Monday Operations Pulse',
      purpose: "Collect each person's operations update so the 11:00 status meeting only happens if something needs a live conversation.",
      desiredOutcome: 'Everyone’s status, blockers and changes captured by 10:30.',
      dueAt: (simulationFlags().pulseOverdue ? atLocal(8, 30) : atLocal(10, 30)).toISOString(),
      questionCount: 4,
      estimatedMinutes: 4,
      status: this.flags.pulseDone ? 'COMPLETE' : this.sessionInProgress('PULSE') ? 'IN_PROGRESS' : 'NOT_STARTED',
      whyAsked: [
        "Your team's Monday status meeting runs an hour. DutyGraph collects each person's update separately instead, so the meeting only happens if something truly needs a live conversation.",
        "The questions build on what you told DutyGraph last week, so you won't be asked to repeat yourself.",
      ],
      replacesMeeting: { meetingId: MOCK_IDS.meetingStatus, title: 'Operations status meeting', startsAt: atLocal(11, 0).toISOString(), durationMinutes: 60 },
      teamStatusVisible: true,
    };
  }

  /** Topics shown on the Pulse intro ("Your Pulse will cover"). */
  static pulseTopics = ["Last week's commitment", 'The NetSuite blocker you raised', 'Inbound freight delays', 'Anything the team should know'];

  async getTeamStatus(pulseId: Id): Promise<TeamStatus> {
    await this.net(200);
    if (pulseId !== MOCK_IDS.pulse) throw new CompanionApiError('NOT_FOUND', 'This Pulse is no longer available.', 404, false);
    const overdue = simulationFlags().pulseOverdue;
    const rows = TEAM.map((name) => {
      const isYou = name === this.participant.displayName;
      const done = isYou ? this.flags.pulseDone : DONE_ORDER.indexOf(name) < this.teamDone;
      return {
        participantId: `p-${name.toLowerCase().replace(/\W+/g, '-')}`,
        displayName: name,
        isYou,
        status: done ? ('COMPLETE' as const) : overdue ? ('OVERDUE' as const) : isYou && this.sessionInProgress('PULSE') ? ('IN_PROGRESS' as const) : ('DUE_SOON' as const),
      };
    });
    const completeCount = rows.filter((r) => r.status === 'COMPLETE').length;
    const remaining = TEAM.length - completeCount;
    const note =
      remaining === 0
        ? this.flags.avoidedKnown
          ? "Everyone's in. The 11:00 meeting isn't needed."
          : "Everyone's in."
        : overdue
          ? `${remaining} still to go · past the 10:30 deadline`
          : `${remaining} still to go · due 10:30 AM`;
    return {
      pulseId,
      title: 'Monday Operations Pulse',
      dueAt: atLocal(10, 30).toISOString(),
      completeCount,
      totalCount: TEAM.length,
      note,
      rows,
      meetingOutcome: this.flags.avoidedKnown
        ? { meetingId: MOCK_IDS.meetingStatus, title: "You don't need to join the 11:00 meeting", body: '50 minutes returned to you', route: `/meetings/${MOCK_IDS.meetingStatus}/avoided` }
        : undefined,
    };
  }

  private startTeamProgress() {
    if (this.teamTimer) clearInterval(this.teamTimer);
    this.teamTimer = setInterval(() => {
      if (simulationFlags().teamIncomplete || this.teamDone >= 10) return;
      this.teamDone += 1;
      this.emit({ type: 'team_progress', done: this.teamDone });
      if (this.teamDone >= 10) {
        if (this.teamTimer) clearInterval(this.teamTimer);
        this.flags.avoidedKnown = true;
        this.emit({ type: 'meeting_avoided', meetingId: MOCK_IDS.meetingStatus });
      }
    }, 2600 * Math.max(this.latency, 0.01));
  }

  // -------------------------------------------------------------------------
  // Conversation
  // -------------------------------------------------------------------------

  async startConversation(input: Parameters<CompanionRepository['startConversation']>[0]): Promise<ConversationSession> {
    await this.net(400);
    const { mode, requestId } = input;
    // Resume an unsubmitted session for the same request instead of starting over.
    for (const r of this.sessions.values()) {
      if (r.session.requestId === requestId && r.mode === mode && !r.submitted) return clone(r.session);
    }
    const id = `sess-${mode.toLowerCase()}-${Date.now().toString(36)}-${this.sessions.size}`;
    const script = mode === 'CONFIRMATION' || mode === 'MEETING_WRAP_UP' ? undefined : SCRIPTS[mode];
    const source = this.sourceFor(mode, requestId);
    const session: ConversationSession = {
      id,
      requestId,
      mode,
      title: script?.title ?? (mode === 'CONFIRMATION' ? "Friday's Operations Review" : 'NetSuite rollout decision'),
      state: script ? 'ACTIVE' : 'REVIEW_READY',
      promptVersion: PROMPT_VERSION,
      progress: { current: 1, total: script?.total ?? 1 },
      utterances: [],
      opening: script?.opening,
      source,
      startedAt: new Date().toISOString(),
    };
    if (script) {
      const first = script.turns[0];
      session.utterances.push(this.agentUtterance(id, 0, first.agent, 'QUESTION'));
    }
    this.sessions.set(id, { session, mode, script, idx: 0, vagueAsked: new Set(), items: [] });
    return clone(session);
  }

  private sourceFor(mode: ConversationMode, requestId: Id): ConversationSession['source'] {
    switch (mode) {
      case 'PULSE':
        return { type: 'PULSE', id: MOCK_IDS.pulse };
      case 'CLARIFICATION':
        return { type: 'CLARIFICATION', id: MOCK_IDS.clarification };
      case 'DISCOVERY':
        return { type: 'DISCOVERY', id: requestId };
      case 'CHANGE_REPORT':
        return { type: 'CHANGE_REPORT', id: requestId };
      case 'MEETING_WRAP_UP':
        return { type: 'MEETING', id: MOCK_IDS.meetingReview };
      case 'CONFIRMATION':
        return { type: 'CONFIRMATION', id: requestId };
    }
  }

  private agentUtterance(sessionId: Id, sequence: number, text: string, kind: Utterance['kind']): Utterance {
    return { id: `${sessionId}-u${sequence}`, sessionId, speaker: 'DUTYGRAPH', text, sequence, final: true, source: 'SYSTEM', kind };
  }

  private record(sessionId: Id): SessionRecord {
    const r = this.sessions.get(sessionId);
    if (!r) throw new CompanionApiError('NOT_FOUND', 'This conversation is no longer available.', 404, false);
    return r;
  }

  async getConversation(sessionId: Id): Promise<ConversationSession> {
    await this.net(100);
    return clone(this.record(sessionId).session);
  }

  async transcribeClip(input: Parameters<CompanionRepository['transcribeClip']>[0]): Promise<{ text: string }> {
    await this.net(600);
    if (simulationFlags().providerError) {
      throw new CompanionApiError('TRANSCRIPTION_TIMEOUT', "We couldn't transcribe that answer.", 504, true);
    }
    return { text: this.sampleAnswerFor(input.sessionId) };
  }

  async sendTurn(input: TurnInput): Promise<TurnResult> {
    await this.net(1200);
    if (simulationFlags().providerError) {
      throw new CompanionApiError('PROVIDER_UNAVAILABLE', 'DutyGraph could not process that answer just now.', 503, true);
    }
    const rec = this.record(input.sessionId);
    const s = rec.session;
    if (!rec.script) throw new CompanionApiError('INVALID_STATE', 'This item has no conversation.', 409, false);
    // Idempotent: a retried turn with the same utterance id changes nothing.
    if (s.utterances.some((u) => u.id === input.utteranceId)) {
      return { session: clone(s), reviewReady: s.state === 'REVIEW_READY' };
    }
    if (s.state !== 'ACTIVE' && s.state !== 'FOLLOW_UP' && s.state !== 'NEXT_TOPIC') {
      throw new CompanionApiError('INVALID_STATE', 'This conversation is already finished.', 409, false);
    }
    let seq = s.utterances.length;
    s.utterances.push({
      id: input.utteranceId,
      sessionId: s.id,
      speaker: 'PARTICIPANT',
      text: input.text.trim(),
      sequence: seq++,
      final: true,
      source: input.source,
    });

    const turns = rec.script.turns;
    const current = turns[rec.idx];
    const next = turns[rec.idx + 1];
    const words = input.text.trim().split(/\s+/).filter(Boolean).length;

    // Dynamic follow-up: a very short answer, where the script has no follow-up
    // planned, gets one clarifying question (only once per topic).
    const isLastTopic = !next;
    if (words < VAGUE_WORD_THRESHOLD && !next?.follow && !rec.vagueAsked.has(rec.idx) && !isLastTopic) {
      rec.vagueAsked.add(rec.idx);
      s.utterances.push(this.agentUtterance(s.id, seq++, VAGUE_FOLLOW_UP, 'FOLLOW_UP'));
      s.state = 'FOLLOW_UP';
      return { session: clone(s), reviewReady: false };
    }

    if (current.ack) s.utterances.push(this.agentUtterance(s.id, seq++, current.ack, 'ACKNOWLEDGEMENT'));
    if (next) {
      rec.idx += 1;
      s.utterances.push(this.agentUtterance(s.id, seq++, next.agent, next.follow ? 'FOLLOW_UP' : 'QUESTION'));
      s.state = next.follow ? 'FOLLOW_UP' : 'NEXT_TOPIC';
      s.progress = { current: next.q, total: rec.script.total };
      return { session: clone(s), reviewReady: false };
    }
    s.state = 'REVIEW_READY';
    return { session: clone(s), reviewReady: true };
  }

  async stopConversation(sessionId: Id): Promise<ConversationSession> {
    await this.net(200);
    const rec = this.record(sessionId);
    const answered = rec.session.utterances.some((u) => u.speaker === 'PARTICIPANT');
    rec.session.state = answered ? 'REVIEW_READY' : 'READY';
    return clone(rec.session);
  }

  async getReview(sessionId: Id): Promise<Review> {
    await this.net(1300);
    const rec = this.record(sessionId);
    if (rec.session.state !== 'REVIEW_READY' && rec.session.state !== 'REVIEWING') {
      throw new CompanionApiError('INVALID_STATE', 'Answer the questions first.', 409, false);
    }
    if (!rec.items.length) {
      const sources = rec.session.utterances.filter((u) => u.speaker === 'PARTICIPANT').map((u) => u.id);
      rec.items = INTERPRETATIONS[rec.mode].map((seed, i) => ({
        id: `${sessionId}-item${i}`,
        sessionId,
        category: seed.category,
        label: seed.label,
        proposedText: seed.proposedText,
        status: 'PENDING',
        sourceUtteranceIds: sources,
        allowedActions: seed.allowedActions ?? ['CONFIRM', 'CHANGE'],
        confirmLabel: seed.confirmLabel,
        confirmedLabel: seed.confirmedLabel,
      }));
    }
    rec.session.state = 'REVIEWING';
    return {
      sessionId,
      mode: rec.mode,
      copy: REVIEW_COPY[rec.mode],
      items: clone(rec.items),
      canAddItems: rec.mode !== 'MEETING_WRAP_UP' && rec.mode !== 'CONFIRMATION',
    };
  }

  async updateReviewItem(sessionId: Id, item: InterpretationItem): Promise<InterpretationItem> {
    await this.net(150);
    const rec = this.record(sessionId);
    const existing = rec.items.find((i) => i.id === item.id);
    if (existing) {
      if (item.status === 'CHANGED' && !existing.allowedActions.includes('CHANGE')) {
        throw new CompanionApiError('FORBIDDEN_FIELD', "You can't change the wording of this item.", 403, false);
      }
      Object.assign(existing, { status: item.status, participantEditedText: item.participantEditedText });
      return clone(existing);
    }
    if (!item.addedByParticipant) throw new CompanionApiError('NOT_FOUND', 'Item not found.', 404, false);
    rec.items.push({ ...item, sessionId });
    return clone(item);
  }

  async submitReview(input: SubmitInput): Promise<SubmitResult> {
    // Hold on "Sending…" while the simulation asks for it.
    while (simulationFlags().holdSend) await delay(300 * Math.max(this.latency, 0.01));
    await this.net(1400);
    if (simulationFlags().failSend) {
      throw new CompanionApiError('SUBMIT_UNAVAILABLE', "Couldn't send just now.", 503, true);
    }
    const rec = this.record(input.sessionId);
    if (rec.submitted) {
      if (rec.submitted.key === input.idempotencyKey) return clone(rec.submitted.result);
      throw new CompanionApiError('IDEMPOTENCY_CONFLICT', 'This was already sent.', 409, false);
    }
    // The server records the reviewed version, not the original interpretation.
    rec.items = clone(input.items);
    rec.session.state = 'SUBMITTED';
    rec.session.endedAt = new Date().toISOString();
    const copy = DONE_COPY[rec.mode];
    const result: SubmitResult = { sessionId: input.sessionId, acknowledgedAt: new Date().toISOString(), headline: copy.headline, body: copy.body };

    switch (rec.mode) {
      case 'PULSE':
        this.flags.pulseDone = true;
        result.nextRoute = `/pulse/${MOCK_IDS.pulse}/team-status`;
        this.startTeamProgress();
        break;
      case 'CONFIRMATION':
        this.flags.confirmDone = true;
        result.createdCommitmentIds = ['c-cutoff'];
        break;
      case 'CLARIFICATION':
        this.flags.clarifyDone = true;
        this.clarifyResolvedLabel = "it's shared — Operations flags, Finance decides";
        break;
      case 'DISCOVERY':
        this.flags.discDone = true;
        break;
      case 'CHANGE_REPORT':
        this.flags.changedDone = true;
        result.proposedGraphDeltaIds = [`delta-${rec.session.requestId}`];
        break;
      case 'MEETING_WRAP_UP':
        this.flags.wrapDone = true;
        result.createdCommitmentIds = ['c-fallback'];
        result.nextRoute = '/work/commitments/c-fallback';
        break;
    }
    rec.submitted = { key: input.idempotencyKey, result };
    return clone(result);
  }

  // -------------------------------------------------------------------------
  // Meetings
  // -------------------------------------------------------------------------

  async getMeetings(): Promise<MeetingSummary[]> {
    await this.net(300);
    const f = this.flags;
    return [
      {
        id: MOCK_IDS.pulse,
        title: 'Monday Operations Pulse',
        group: 'ASYNC',
        whenLabel: 'Due 10:30',
        outcome: 'ASYNC',
        statusLine: f.pulseDone ? 'Submitted · see team status' : '4 questions · about 4 min',
        tone: f.pulseDone ? 'sage' : 'amber',
        route: f.pulseDone ? `/pulse/${MOCK_IDS.pulse}/team-status` : `/pulse/${MOCK_IDS.pulse}`,
      },
      {
        id: MOCK_IDS.meetingStatus,
        title: 'Operations status meeting',
        group: 'TODAY',
        whenLabel: '11:00 AM',
        startsAt: atLocal(11, 0).toISOString(),
        outcome: f.avoidedKnown ? 'AVOIDED' : 'PENDING',
        statusLine: f.avoidedKnown ? "You don't need to join · 50 min returned" : "Waiting on team Pulses. You'll know by 10:30.",
        tone: f.avoidedKnown ? 'sage' : 'plain',
        route: f.avoidedKnown ? `/meetings/${MOCK_IDS.meetingStatus}/avoided` : `/pulse/${MOCK_IDS.pulse}/team-status`,
      },
      {
        id: MOCK_IDS.meetingReview,
        title: 'Project review',
        group: 'TODAY',
        whenLabel: '2:00 PM',
        startsAt: atLocal(14, 0).toISOString(),
        outcome: f.wrapDone ? 'COMPLETED' : 'SHORTENED',
        statusLine: f.wrapDone ? 'Outcome confirmed' : "Now 15 minutes · you're needed for one decision",
        tone: f.wrapDone ? 'sage' : 'amber',
        route: f.wrapDone ? '/work' : `/meetings/${MOCK_IDS.meetingReview}/shortened`,
      },
      {
        id: MOCK_IDS.meetingFriday,
        title: 'Operations Review',
        group: 'RECENT',
        whenLabel: 'Friday',
        outcome: 'COMPLETED',
        statusLine: f.confirmDone ? 'Confirmed by you' : '2 items to confirm',
        tone: f.confirmDone ? 'sage' : 'violet',
        route: f.confirmDone ? '' : `/confirmations/${MOCK_IDS.confirmRequest}`,
      },
    ];
  }

  async getMeeting(meetingId: Id): Promise<MeetingDetail> {
    await this.net(250);
    const joinTarget = { provider: 'GOOGLE_MEET' as const, label: 'Join in Google Meet', url: 'https://meet.google.com/' };
    if (meetingId === MOCK_IDS.meetingStatus) {
      return {
        id: meetingId,
        title: 'Operations status meeting',
        outcome: 'AVOIDED',
        startsAt: atLocal(11, 0).toISOString(),
        originalDurationMinutes: 60,
        minutesReturned: 50,
        headline: "You don't need to join the 11:00 meeting",
        reason: "DutyGraph collected the team's updates asynchronously. Two issues still need a live conversation, but neither requires you.",
        summary: [
          '8 of 11 people reported no blockers.',
          'NetSuite rollout: production credentials are now with IT. Friday may slip a day.',
          'Two issues need a live conversation. Finance and Engineering are covering them at 11:00.',
          'Nothing in the summary needs action from you.',
        ],
        hasBrief: false,
        hasWrapUp: false,
      };
    }
    if (meetingId === MOCK_IDS.meetingReview) {
      return {
        id: meetingId,
        title: 'NetSuite rollout decision',
        outcome: 'SHORTENED',
        startsAt: atLocal(14, 0).toISOString(),
        endsAt: atLocal(14, 15).toISOString(),
        originalDurationMinutes: 60,
        newDurationMinutes: 15,
        minutesReturned: 45,
        headline: 'Your live meeting is now 15 minutes',
        reason: "This morning's Pulses resolved most of the agenda. You're needed for one decision.",
        purpose: 'Choose the production rollout path.',
        expectedOutcome: 'Choose the production rollout path.',
        whyYou: 'You own the current integration workflow and can confirm whether the workaround is viable.',
        yourRole: 'Provide the current integration constraints.',
        issue: 'Can Option B launch without the production credentials?',
        joinTarget,
        hasBrief: true,
        hasWrapUp: true,
      };
    }
    if (meetingId === 'mtg-netsuite-required') {
      return {
        id: meetingId,
        title: 'NetSuite rollout decision',
        outcome: 'REQUIRED',
        startsAt: atLocal(14, 0).toISOString(),
        newDurationMinutes: 14,
        headline: "You're needed live",
        reason: 'DutyGraph found one unresolved question that needs you, Jesse and Matt together.',
        purpose: 'Choose the production rollout path.',
        expectedOutcome: 'Choose the production rollout path.',
        whyYou: 'You own the current integration workflow and can confirm whether the workaround is viable.',
        yourRole: 'Provide the current integration constraints.',
        joinTarget,
        hasBrief: true,
        hasWrapUp: true,
      };
    }
    throw new CompanionApiError('NOT_FOUND', 'This meeting is no longer available.', 404, false);
  }

  async getMeetingBrief(meetingId: Id): Promise<MeetingBrief> {
    await this.net(300);
    if (meetingId !== MOCK_IDS.meetingReview && meetingId !== 'mtg-netsuite-required') {
      throw new CompanionApiError('NOT_FOUND', 'There is no brief for this meeting.', 404, false);
    }
    const start = atLocal(14, 0);
    return {
      meetingId,
      title: 'NetSuite rollout decision',
      whenLabel: formatClock(start),
      durationMinutes: 15,
      purpose: 'Choose the production rollout path.',
      expectedOutcome: 'A decision between Option A (wait for credentials) and Option B (batch export fallback).',
      whyYou: 'Provide the current integration constraints.',
      alreadyKnown: [
        'Finance approval is complete.',
        'Production credentials are still outstanding.',
        'Friday is still the target.',
        'Two technical options remain.',
      ],
      openQuestions: ['Whether Option B is safe to run for two days without production credentials.'],
      mayAskYou: ['Can Option B launch without the production credentials?', 'What risk does that introduce?'],
      decisionAuthority: 'Matt owns the final rollout decision.',
      joinTarget: { provider: 'GOOGLE_MEET', label: 'Join in Google Meet', url: 'https://meet.google.com/' },
    };
  }

  async getLiveMeeting(meetingId: Id): Promise<LiveMeetingState> {
    await this.net(200);
    return {
      meetingId,
      title: 'NetSuite rollout decision',
      endsAt: new Date(Date.now() + 14 * 60_000).toISOString(),
      currentQuestion: 'Can Option B run without the production credentials?',
      purpose: 'Choose the production rollout path.',
      decisionOwner: 'Matt',
      parkingLot: ['Whether Northline moves to the new API before the holiday peak.', 'Who owns the rollback runbook after launch.'],
      recentTranscript: [
        "Jesse: If we go with B we're relying on the batch export for two days.",
        "Matt: What's the risk if the batch fails overnight?",
        'DutyGraph: Dana, you own the current integration workflow. Can Option B run without production credentials?',
      ],
      closeReady: false,
    };
  }

  async startWrapUp(meetingId: Id): Promise<ConversationSession> {
    return this.startConversation({ requestId: `req-wrapup-${meetingId}`, mode: 'MEETING_WRAP_UP' });
  }

  // -------------------------------------------------------------------------
  // Work
  // -------------------------------------------------------------------------

  private commitments(): Commitment[] {
    const list: Commitment[] = [
      {
        id: 'c-cutoff',
        kind: 'COMMITMENT',
        title: 'Confirm carrier cutoff times',
        outcome: "Send each carrier's latest drop-off time to dispatch.",
        dueAt: atLocal(16, 0).toISOString(),
        dueLabel: 'Due today · 4:00 PM',
        why: 'Dispatch starts booking carrier appointments next Monday.',
        authority: 'You set cutoff times for North Dock.',
        definitionOfDone: 'All three carrier cutoffs sent to dispatch and acknowledged.',
        status: 'OPEN',
        sourceType: 'MEETING',
        sourceId: MOCK_IDS.meetingFriday,
        sourceLabel: "Friday's Operations Review",
        canComplete: true,
      },
      {
        id: 'c-fallback',
        kind: 'COMMITMENT',
        title: 'Validate fallback procedure',
        outcome: 'Confirm Option B can operate safely without production credentials.',
        dueAt: atLocal(15, 0, 3).toISOString(),
        dueLabel: 'Thursday · 3:00 PM',
        why: "Required before Friday's production rollout.",
        authority: 'You may approve the technical fallback. Matt owns final rollout approval.',
        definitionOfDone: 'Run the fallback test and record pass or fail, plus any risk you find.',
        status: 'OPEN',
        sourceType: 'MEETING',
        sourceId: MOCK_IDS.meetingReview,
        sourceLabel: 'NetSuite rollout decision',
        canComplete: true,
      },
      {
        id: 'c-proposal',
        kind: 'COMMITMENT',
        title: "Review Northline's revised proposal",
        outcome: "Flag anything in Northline's proposal that conflicts with current dock hours.",
        dueAt: atLocal(17, 0, 3).toISOString(),
        dueLabel: 'Thursday',
        why: 'Engineering picks a carrier-integration vendor on Friday.',
        authority: 'You advise. Matt decides.',
        definitionOfDone: 'Comments returned to Matt.',
        status: 'OPEN',
        sourceType: 'MEETING',
        sourceLabel: 'Vendor rollout discussion',
        canComplete: true,
      },
      {
        id: 'w-creds',
        kind: 'WAITING_ON',
        title: 'Production credentials',
        outcome: "Needed for Friday's NetSuite production rollout",
        dueLabel: 'Owner: Samir Patel, IT',
        status: 'WAITING',
        sourceType: 'PULSE',
        sourceId: MOCK_IDS.pulse,
        sourceLabel: 'Monday Pulse',
        waitingOn: { displayName: 'Samir Patel', team: 'IT' },
        latest: 'Samir expects Wednesday — from your Monday Pulse.',
        whatHappensNext: "DutyGraph will check with Samir on Wednesday and tell you either way. You don't need to chase it.",
        canComplete: false,
      },
    ];
    return list
      .filter((c) => c.id !== 'c-fallback' || this.flags.wrapDone)
      .map((c) => (this.completed.has(c.id) ? { ...c, status: 'COMPLETE' as const, completedAt: new Date().toISOString() } : c));
  }

  async getWork(): Promise<WorkList> {
    await this.net(300);
    const all = this.commitments();
    const open = all.filter((c) => c.status === 'OPEN');
    const today = new Date();
    const isToday = (c: Commitment) => !!c.dueAt && new Date(c.dueAt).toDateString() === today.toDateString();
    return {
      today: open.filter(isToday),
      thisWeek: open.filter((c) => !isToday(c)),
      later: [],
      waiting: all.filter((c) => c.status === 'WAITING'),
      done: all.filter((c) => c.status === 'COMPLETE'),
    };
  }

  async getCommitment(commitmentId: Id): Promise<Commitment> {
    await this.net(200);
    const all = this.commitments();
    // Allow opening the wrap-up commitment from a deep link even before wrap-up in the demo.
    const found = all.find((c) => c.id === commitmentId) ?? (commitmentId === 'c-fallback' ? { ...this.fallbackPreview() } : undefined);
    if (!found) throw new CompanionApiError('NOT_FOUND', 'This item is no longer available.', 404, false);
    return found;
  }

  private fallbackPreview(): Commitment {
    const wasDone = this.flags.wrapDone;
    this.flags.wrapDone = true;
    const c = this.commitments().find((x) => x.id === 'c-fallback')!;
    this.flags.wrapDone = wasDone;
    return c;
  }

  async completeCommitment(commitmentId: Id, idempotencyKey: string): Promise<Commitment> {
    await this.net(600);
    const prior = this.idempotentCompletions.get(idempotencyKey);
    if (prior) return clone(prior);
    const c = await this.getCommitment(commitmentId);
    if (!c.canComplete) throw new CompanionApiError('FORBIDDEN', "You can't mark this complete.", 403, false);
    this.completed.add(commitmentId);
    const done = { ...c, status: 'COMPLETE' as const, completedAt: new Date().toISOString() };
    this.idempotentCompletions.set(idempotencyKey, done);
    return clone(done);
  }

  // -------------------------------------------------------------------------
  // Continuous discovery
  // -------------------------------------------------------------------------

  async getClarification(clarificationId: Id): Promise<Clarification> {
    await this.net(250);
    if (clarificationId !== MOCK_IDS.clarification) throw new CompanionApiError('NOT_FOUND', 'This question was already settled.', 404, false);
    return {
      id: MOCK_IDS.clarification,
      requestId: MOCK_IDS.clarificationRequest,
      prompt: 'Which is accurate today?',
      context: 'DutyGraph needs your help',
      existingStatement: { text: 'Finance owns invoice exceptions.', source: 'You said, on 14 September' },
      conflictingStatement: { text: 'Operations owns them.', source: 'The current process record says' },
      options: [
        { id: 'finance', label: 'Finance owns them' },
        { id: 'operations', label: 'Operations owns them' },
        { id: 'complicated', label: "It's more complicated", opensConversation: true },
      ],
      status: this.flags.clarifyDone ? 'RESOLVED' : 'OPEN',
      resolvedLabel: this.clarifyResolvedLabel,
    };
  }

  async respondToClarification(clarificationId: Id, optionId: Id): Promise<SubmitResult> {
    await this.net(700);
    const c = await this.getClarification(clarificationId);
    const option = c.options.find((o) => o.id === optionId);
    if (!option || option.opensConversation) throw new CompanionApiError('INVALID_OPTION', 'Pick one of the answers.', 400, false);
    this.flags.clarifyDone = true;
    this.clarifyResolvedLabel = option.label.toLowerCase();
    return {
      sessionId: `clar-${clarificationId}`,
      acknowledgedAt: new Date().toISOString(),
      headline: 'Thanks — that settles it',
      body: `Recorded as: ${option.label.toLowerCase()}.`,
    };
  }

  async getChangeKinds(): Promise<ChangeKindOption[]> {
    await delay(100 * this.latency);
    return [
      { kind: 'RESPONSIBILITIES', label: 'Your responsibilities changed' },
      { kind: 'PROCESS', label: 'A process works differently now' },
      { kind: 'NEW_SOFTWARE', label: 'You started using new software' },
      { kind: 'STOPPED_TASK', label: 'You stopped doing a task' },
      { kind: 'OWNER', label: 'Someone else owns something now' },
      { kind: 'APPROVAL_STEP', label: 'An approval step changed' },
      { kind: 'OTHER', label: 'Something else changed' },
    ];
  }

  async createChangeReport(_kind: ChangeKind): Promise<{ requestId: Id }> {
    await this.net(300);
    return { requestId: `req-change-${++this.changeSeq}` };
  }

  async getDiscoveryRequest(requestId: Id): Promise<DiscoveryRequest> {
    await this.net(250);
    if (requestId !== MOCK_IDS.discoveryRequest) throw new CompanionApiError('NOT_FOUND', 'This request is no longer available.', 404, false);
    return {
      id: requestId,
      requestId,
      title: 'DutyGraph wants to understand your work',
      intro: 'Operations is mapping what actually happens on the north dock when inbound freight runs late — not the written process.',
      questionCount: 3,
      estimatedMinutes: 7,
      dueAt: atLocal(17, 0, 2).toISOString(),
      whyAsked: [
        'Operations is mapping how late inbound freight is really handled, so the written process can match what people actually do.',
        'Your answers describe your own work. Nothing counts as your answer until you review it and choose to send.',
      ],
    };
  }

  // -------------------------------------------------------------------------
  // Hands-free question cards (docs/specs/COMPANION-HANDS-FREE.md §5)
  // -------------------------------------------------------------------------

  private questionRequest(requestId: Id): MockQuestionRequest {
    const r = mockQuestionRequest(requestId);
    if (!r || !this.questionRequests().includes(r)) throw new CompanionApiError('NOT_FOUND', 'This request is no longer available.', 404, false);
    return r;
  }

  async getQuestionSet(requestId: Id): Promise<QuestionSet> {
    await this.net(250);
    const r = this.questionRequest(requestId);
    if (this.hfSent.has(requestId) || (requestId === MOCK_IDS.discoveryRequest && this.flags.discDone)) {
      throw new CompanionApiError('REQUEST_CLOSED', 'This request is no longer open.', 409, false);
    }
    return {
      requestId,
      version: HF_VERSION,
      contentHash: hfHash(requestId),
      title: r.title,
      advisorName: r.advisorName,
      companyName: r.companyName,
      dueDate: dueDateFor(r, new Date()),
      estimatedMinutes: minutesFor(r.questions.length),
      questions: buildQuestions(r.questions, { advisorName: r.advisorName }),
      whyAsked: [...r.whyAsked],
    };
  }

  /** The demo runs on the local check alone, as the prototype does. */
  async checkCoverage(_input: CoverageCheckInput): Promise<ServerCoverage> {
    return { available: false, reason: 'LOCAL_ONLY' };
  }

  /**
   * The prototype's polished text when the words match the scripted answer, otherwise the
   * person's own words tidied. "Provider error" and offline give `available: false`.
   */
  async understandAnswers(input: UnderstandInput): Promise<UnderstandResult> {
    await delay(900 * this.latency);
    const f = simulationFlags();
    if (f.offline) return { available: false, reason: 'NETWORK_OFFLINE' };
    if (f.providerError) return { available: false, reason: 'PROVIDER_UNAVAILABLE' };
    const r = mockQuestionRequest(input.requestId);
    if (!r) return { available: false, reason: 'NOT_FOUND' };
    const items = input.answers
      .filter((a) => a.text.trim() && /^question\.\d+$/.test(a.key))
      .map((a) => ({ key: a.key, ...mockUnderstood(r, a.key, a.text) }));
    return { available: true, items };
  }

  /** Idempotent by key; holds on "Sending…", fails and goes offline with the Developer toggles. */
  /** Demo and tests: the answers last sent for a request, as the server would store them, or null. */
  sentAnswers(requestId: Id): SubmitAnswersInput['submission'] | null {
    const sent = this.hfSent.get(requestId);
    return sent ? clone(sent.submission) : null;
  }

  async submitAnswers(input: SubmitAnswersInput): Promise<SubmitAnswersResult> {
    while (simulationFlags().holdSend) await delay(300 * Math.max(this.latency, 0.01));
    await this.net(1400);
    if (simulationFlags().failSend) {
      throw new CompanionApiError('SUBMIT_UNAVAILABLE', "Couldn't send just now.", 503, true);
    }
    const prior = this.hfSent.get(input.requestId);
    if (prior) {
      if (prior.key === input.idempotencyKey) return { ...prior.result, idempotentReplay: true };
      throw new CompanionApiError('IDEMPOTENCY_CONFLICT', 'This was already sent.', 409, false);
    }
    this.questionRequest(input.requestId);
    if (input.expectedVersion !== HF_VERSION) throw new CompanionApiError('VERSION_CONFLICT', 'These questions changed. Open them again.', 409, false);
    if (input.contentHash !== hfHash(input.requestId)) throw new CompanionApiError('HASH_CONFLICT', 'These questions changed. Open them again.', 409, false);
    if (!hasSomethingToSend(input.submission)) throw new CompanionApiError('VALIDATION_ERROR', 'Answer at least one question first.', 422, false);
    const result: SubmitAnswersResult = { responseId: `resp-${input.requestId}`, requestId: input.requestId, idempotentReplay: false };
    // Kept as sent (the per-question fields and, since 1.3, where each answer's words came from), as the server keeps them.
    this.hfSent.set(input.requestId, { key: input.idempotencyKey, result, at: new Date().toISOString(), submission: clone(input.submission) });
    if (input.requestId === MOCK_IDS.discoveryRequest) this.flags.discDone = true;
    return clone(result);
  }
}
