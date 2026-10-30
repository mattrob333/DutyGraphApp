/**
 * HTTP adapter for the pinned Companion contract (`/api/mobile/v1`, v1.1, plus
 * the 1.2 hands-free question cards).
 *
 * It uses the same server path as the emailed "answer the questions" link.
 * The server has no conversation, pulse, meeting or commitment endpoints yet,
 * so Discovery is a client-side walk over the request's question list, and
 * everything else the contract does not offer rejects with
 * `NOT_AVAILABLE` (501) rather than showing invented data.
 */
import { Platform } from "react-native";
import {
  HttpParticipantExtrasRepository,
  pulseIdFromRequest,
  mapPulse,
} from "../extras/http";
import { config } from "../config";
import * as Device from "expo-device";
import type { CompanionRepository } from "../repository";
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
  type NotificationPreferences,
  type Participant,
  type Pulse,
  type Review,
  type SubmitInput,
  type SubmitResult,
  type TeamStatus,
  type TodayFeed,
  type TurnInput,
  type TurnResult,
  type Utterance,
  type VoicePreferences,
  type WorkList,
} from "@/types/domain";
import type {
  CoverageCheckInput,
  QuestionSet,
  ServerCoverage,
  SubmitAnswersInput,
  SubmitAnswersResult,
  UnderstandInput,
  UnderstandResult,
} from "@/types/handsfree";
import { newIdempotencyKey } from "@/utils/id";
import type { components } from "../generated/companion-mobile-v1";
import { REVIEW_COPY } from "../mock/scripts";
import {
  ApiClient,
  getParticipantSessionGeneration,
  assertParticipantGeneration,
  TRANSCRIBE_TIMEOUT_MS,
} from "./client";
import { isUnderstandingUnavailable, notAvailable } from "./errors";
import {
  coverageBody,
  mapCoverage,
  mapQuestionSet,
  mapUnderstood,
  submitAnswersBody,
  understandBody,
  type CoverageDto,
  type QuestionDetailDto,
  type UnderstandDto,
} from "./handsFree";
import {
  isTerminalAnswersError,
  pendingAnswers,
  sameAnswers,
} from "./pendingAnswers";
import { clearAllDrafts } from "@/features/handsfree/draft";
import {
  DEFAULT_NOTIFICATION_PREFS,
  DEFAULT_VOICE_PREFS,
  mapDiscovery,
  mapProfile,
  mapToday,
  proposedToItem,
  taskCardSentence,
  toLocalIso,
  type ProfileDto,
  type ProposedTaskDto,
  type RequestDetailDto,
  type RequestSummaryDto,
  type TaskCardDto,
} from "./mappers";
import { localState, type CardRef, type SessionRecord } from "./localState";

type S = components["schemas"];

const PROMPT_VERSION_FALLBACK = "client-question-list-v1";
const WORDS_COPY =
  "DutyGraph can't summarize this right now. Your own words will go to your advisor for review.";

const sessionIdFor = (requestId: Id) => `http-${requestId}`;
/** The deck waits at most 2.5 s for a coverage check; a slower answer is not worth holding a connection for. */
const COVERAGE_TIMEOUT_MS = 5_000;
const UNDERSTAND_TIMEOUT_MS = 60_000;
const errorCode = (e: unknown) =>
  e instanceof CompanionApiError ? e.code : "NETWORK_ERROR";
const emptyWork = (): WorkList => ({
  today: [],
  thisWeek: [],
  later: [],
  waiting: [],
  done: [],
});
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

const CHANGE_KINDS: ChangeKindOption[] = [
  { kind: "RESPONSIBILITIES", label: "Your responsibilities changed" },
  { kind: "PROCESS", label: "A process works differently now" },
  { kind: "NEW_SOFTWARE", label: "You started using new software" },
  { kind: "STOPPED_TASK", label: "You stopped doing a task" },
  { kind: "OWNER", label: "Someone else owns something now" },
  { kind: "APPROVAL_STEP", label: "An approval step changed" },
  { kind: "OTHER", label: "Something else changed" },
];

function audioName(mime: string): string {
  const m = mime.split(";")[0].trim().toLowerCase();
  const ext = m.includes("aac")
    ? "aac"
    : m.includes("webm")
      ? "webm"
      : m.includes("wav")
        ? "wav"
        : m.includes("mpeg")
          ? "mp3"
          : m.includes("ogg")
            ? "ogg"
            : "m4a";
  return `answer.${ext}`;
}

function deviceLabel(): string {
  let name: string | null | undefined;
  try {
    name = Device.deviceName || Device.modelName;
  } catch {
    name = undefined;
  }
  const os =
    Platform.OS === "ios"
      ? "iPhone"
      : Platform.OS === "android"
        ? "Android phone"
        : "Phone";
  return (name || os).trim().slice(0, 80);
}

export class HttpCompanionRepository implements CompanionRepository {
  readonly kind = "http" as const;
  private me: Participant | null = null;
  private readonly sessions = new Map<Id, SessionRecord>();
  /** Hint lists by request, so a coverage answer is filtered to the card's own hints. */
  private readonly questionSets = new Map<Id, QuestionSet>();
  /** One send per request at a time; a second tap joins the first. */
  private readonly sending = new Map<Id, Promise<SubmitAnswersResult>>();

  constructor(
    private readonly api: ApiClient = new ApiClient(),
    private readonly now: () => Date = () => new Date(),
    private readonly newKey: () => string = newIdempotencyKey,
  ) {}

  /** Extensions share this transport so participant refresh remains single-flight. */
  getExtensionApiClient(): ApiClient {
    return this.api;
  }

  private get extras() {
    return new HttpParticipantExtrasRepository(this.api);
  }

  // ---- Identity ------------------------------------------------------------

  async enroll(
    invitationToken: string,
    idempotencyKey: string,
  ): Promise<Participant> {
    const session = await this.api.post<S["ParticipantMobileSession"]>(
      "/enroll",
      { invitationToken, deviceLabel: deviceLabel() },
      { auth: false, idempotencyKey },
    );
    await this.api.saveSession(session);
    return this.getMe();
  }

  async getMe(): Promise<Participant> {
    const profile = await this.api.get<ProfileDto>("/me");
    const prefs = await this.prefs();
    this.me = mapProfile(profile, prefs);
    return clone(this.me);
  }

  private async prefs() {
    const stored = await localState.getPrefs();
    return {
      notificationPreferences: {
        ...DEFAULT_NOTIFICATION_PREFS,
        ...stored.notificationPreferences,
      },
      voicePreferences: { ...DEFAULT_VOICE_PREFS, ...stored.voicePreferences },
    };
  }

  /** No server preferences endpoint carries these settings in 1.1, so they stay on the device. */
  async updatePreferences(patch: {
    notificationPreferences?: Partial<NotificationPreferences>;
    voicePreferences?: Partial<VoicePreferences>;
  }): Promise<Participant> {
    const stored = await localState.getPrefs();
    await localState.setPrefs({
      notificationPreferences: {
        ...stored.notificationPreferences,
        ...patch.notificationPreferences,
      },
      voicePreferences: {
        ...stored.voicePreferences,
        ...patch.voicePreferences,
      },
    });
    if (this.me) {
      const p = await this.prefs();
      this.me = { ...this.me, ...p };
      return clone(this.me);
    }
    return this.getMe();
  }

  async logout(): Promise<void> {
    const revocation = this.api.revokeSession().catch(() => {});
    const drafts = clearAllDrafts();
    this.me = null;
    this.sessions.clear();
    this.questionSets.clear();
    this.sending.clear();
    try {
      await localState.clearParticipantData();
      await pendingAnswers.clear();
    } catch {
      /* The remote device session still expires when offline. */
    }
    await drafts;
    await revocation;
  }

  // ---- Today ---------------------------------------------------------------

  async getToday(): Promise<TodayFeed> {
    const [me, list, done] = await Promise.all([
      this.me ? Promise.resolve(this.me) : this.getMe(),
      this.api.get<S["ParticipantRequestList"]>("/requests"),
      localState.getDone(),
    ]);
    const feed = mapToday(
      { id: me.id, displayName: me.displayName, firstName: me.firstName },
      list.requests as RequestSummaryDto[],
      done,
      this.now(),
    );
    if (config.companionScope === "full" && config.meetingsApiBaseUrl) {
      const inbox = await this.extras
        .getInbox()
        .catch(() => ({ pulses: [], confirmations: [], meetings: [] }));
      for (const dto of inbox.pulses) {
        const pulse = mapPulse(dto);
        if (pulse.status === "COMPLETE") continue;
        feed.dueNow.push({
          id: pulse.id,
          type: "PULSE",
          title: pulse.title,
          summary: `${pulse.questionCount} questions · about ${pulse.estimatedMinutes} min`,
          reason:
            "Share your update so the team can decide if a meeting is needed.",
          estimatedMinutes: pulse.estimatedMinutes,
          dueAt: pulse.dueAt,
          status: pulse.status,
          cta: "Start Pulse",
          route: `/pulse/${pulse.id}`,
          sourceEntityType: "PULSE",
          sourceEntityId: pulse.id,
          createdAt: feed.asOf,
        });
      }
      const outcome = inbox.meetings.find(
        (m) => m.outcome === "AVOIDED" || m.outcome === "SHORTENED",
      );
      if (outcome && !feed.banner)
        feed.banner = {
          meetingId: outcome.id,
          title: outcome.title,
          body: outcome.statusLine,
          route: outcome.route,
        };
      for (const item of inbox.confirmations.filter((c) => !c.complete))
        feed.dueNow.push({
          id: `wrapup:${item.id}`,
          type: "CONFIRMATION",
          title: item.title,
          summary: `${item.itemCount} items about your work`,
          reason:
            "Check the items from this meeting before they count as your answer.",
          status: "NOT_STARTED",
          cta: "Review",
          route: `/confirmations/wrapup:${item.id}`,
          sourceEntityType: "MEETING",
          sourceEntityId: item.meetingId,
          createdAt: feed.asOf,
        });
    }
    return feed;
  }

  async getNotifications(): Promise<AppNotification[]> {
    return [];
  }

  async markNotificationsRead(): Promise<void> {}

  async getDiscoveryRequest(requestId: Id): Promise<DiscoveryRequest> {
    return mapDiscovery(await this.detail(requestId));
  }

  private detail(requestId: Id) {
    return this.api.get<RequestDetailDto>(
      `/requests/${encodeURIComponent(requestId)}`,
    );
  }

  // ---- Conversation --------------------------------------------------------

  async startConversation(input: {
    requestId: Id;
    mode: ConversationMode;
    changeKind?: ChangeKind;
    clarificationOptionId?: Id;
  }): Promise<ConversationSession> {
    if (input.mode !== "DISCOVERY" && input.mode !== "CONFIRMATION")
      return notAvailable();
    const mode = input.mode;
    const d = await this.detail(input.requestId);
    if (d.type === "leadership") {
      throw new CompanionApiError(
        "USE_WEB_LINK",
        "Open this one from your email link in the browser.",
        409,
        false,
      );
    }
    if ((mode === "DISCOVERY") !== (d.type === "work")) return notAvailable();
    if (!d.needsYou) {
      throw new CompanionApiError(
        "REQUEST_CLOSED",
        "This request is no longer open.",
        409,
        false,
      );
    }
    const id = sessionIdFor(d.requestId);
    const existing = await this.load(id);
    const sameQuestions = (r: SessionRecord) =>
      r.questions.length === d.questions.length &&
      r.questions.every((q, i) => q.text === d.questions[i].text);
    if (
      existing &&
      existing.mode === mode &&
      existing.state !== "SUBMITTED" &&
      sameQuestions(existing)
    ) {
      // Resume. The record may have moved on server-side (version/hash); use the current pair.
      existing.version = d.version;
      existing.contentHash = d.contentHash;
      existing.taskCardIds = mode === "CONFIRMATION" ? this.cardIds(d) : [];
      await this.save(existing);
      return this.view(existing);
    }
    const startedAt = toLocalIso(this.now());
    const rec: SessionRecord = {
      id,
      mode,
      requestId: d.requestId,
      title: d.title,
      opening: mode === "DISCOVERY" ? mapDiscovery(d).intro : undefined,
      version: d.version,
      contentHash: d.contentHash,
      questionPlanVersion: d.questionPlanVersion || PROMPT_VERSION_FALLBACK,
      questions:
        mode === "DISCOVERY"
          ? d.questions.map((q) => ({ questionId: q.questionId, text: q.text }))
          : [],
      taskCardIds: mode === "CONFIRMATION" ? this.cardIds(d) : [],
      utterances: [],
      answers: [],
      state: mode === "DISCOVERY" ? "ACTIVE" : "REVIEW_READY",
      startedAt,
    };
    if (mode === "DISCOVERY") rec.utterances.push(this.question(rec, 0));
    await this.save(rec);
    return this.view(rec);
  }

  private cardIds(d: RequestDetailDto): string[] {
    return (
      (d as RequestDetailDto & { taskCardIds?: string[] }).taskCardIds ?? []
    );
  }

  private question(rec: SessionRecord, index: number): Utterance {
    return {
      id: `${rec.id}-q${index}`,
      sessionId: rec.id,
      speaker: "DUTYGRAPH",
      text: rec.questions[index].text,
      sequence: rec.utterances.length,
      final: true,
      source: "SYSTEM",
      kind: "QUESTION",
    };
  }

  private async load(id: Id): Promise<SessionRecord | null> {
    const mem = this.sessions.get(id);
    if (mem) return mem;
    const stored = await localState.getSession(id);
    if (stored) this.sessions.set(id, stored);
    return stored;
  }

  private async record(id: Id): Promise<SessionRecord> {
    const r = await this.load(id);
    if (!r)
      throw new CompanionApiError(
        "NOT_FOUND",
        "This conversation is no longer available.",
        404,
        false,
      );
    return r;
  }

  private async save(rec: SessionRecord, persist = true) {
    this.sessions.set(rec.id, rec);
    if (persist) await localState.saveSession(rec);
  }

  private view(rec: SessionRecord): ConversationSession {
    const total = rec.mode === "DISCOVERY" ? rec.questions.length : 1;
    return {
      id: rec.id,
      requestId: rec.requestId,
      mode: rec.mode,
      title: rec.title,
      state: rec.state,
      promptVersion: rec.questionPlanVersion,
      progress: {
        current: Math.min(rec.answers.length + 1, Math.max(total, 1)),
        total,
      },
      utterances: clone(rec.utterances),
      opening: rec.opening,
      source: {
        type: rec.mode === "DISCOVERY" ? "DISCOVERY" : "CONFIRMATION",
        id: rec.requestId,
      },
      startedAt: rec.startedAt,
      endedAt: rec.endedAt,
    };
  }

  async getConversation(sessionId: Id): Promise<ConversationSession> {
    return this.view(await this.record(sessionId));
  }

  /**
   * The server has no dynamic follow-up judge yet, so DutyGraph asks the
   * request's questions in order and moves to review after the last answer.
   */
  async sendTurn(input: TurnInput): Promise<TurnResult> {
    const rec = await this.record(input.sessionId);
    if (rec.mode !== "DISCOVERY") return notAvailable();
    if (rec.answers.some((a) => a.utteranceId === input.utteranceId)) {
      return {
        session: this.view(rec),
        reviewReady: rec.state === "REVIEW_READY",
      };
    }
    if (rec.state !== "ACTIVE" && rec.state !== "NEXT_TOPIC") {
      throw new CompanionApiError(
        "INVALID_STATE",
        "This conversation is already finished.",
        409,
        false,
      );
    }
    const text = input.text.trim();
    if (!text)
      throw new CompanionApiError(
        "VALIDATION_ERROR",
        "Add your answer first.",
        422,
        false,
      );
    const index = rec.answers.length;
    const jobId = input.source === "VOICE" ? rec.pendingJobId : undefined;
    rec.pendingJobId = undefined;
    rec.answers.push({
      questionId: rec.questions[index].questionId,
      text,
      utteranceId: input.utteranceId,
      source: input.source,
      transcriptJobId: jobId,
    });
    rec.utterances.push({
      id: input.utteranceId,
      sessionId: rec.id,
      speaker: "PARTICIPANT",
      text,
      sequence: rec.utterances.length,
      final: true,
      source: input.source,
    });
    rec.review = undefined;
    if (index + 1 < rec.questions.length) {
      rec.utterances.push(this.question(rec, index + 1));
      rec.state = "NEXT_TOPIC";
    } else {
      rec.state = "REVIEW_READY";
    }
    await this.save(rec);
    return {
      session: this.view(rec),
      reviewReady: rec.state === "REVIEW_READY",
    };
  }

  async transcribeClip(input: {
    sessionId: Id;
    uri: string;
    mimeType: string;
    durationMs: number;
  }): Promise<{ text: string }> {
    const rec = await this.record(input.sessionId);
    const form = new FormData();
    // React Native FormData file part: {uri, name, type}.
    form.append("audio", {
      uri: input.uri,
      name: audioName(input.mimeType),
      type: input.mimeType,
    } as any);
    form.append(
      "meta",
      JSON.stringify({
        expectedVersion: rec.version,
        contentHash: rec.contentHash,
        consent: true,
      }),
    );
    const res = await this.api.request<S["TranscriptionResult"]>(
      "POST",
      `/requests/${encodeURIComponent(rec.requestId)}/transcriptions`,
      {
        formData: form,
        idempotencyKey: this.newKey(),
        timeoutMs: TRANSCRIBE_TIMEOUT_MS,
      },
    );
    if (res.job.state !== "complete" || !res.text?.trim()) {
      throw new CompanionApiError(
        "TRANSCRIPTION_FAILED",
        "We couldn't transcribe that answer.",
        502,
        true,
      );
    }
    rec.pendingJobId = res.job.jobId;
    await this.save(rec);
    return { text: res.text };
  }

  async stopConversation(sessionId: Id): Promise<ConversationSession> {
    const rec = await this.record(sessionId);
    if (rec.mode !== "DISCOVERY") return notAvailable();
    if (rec.state !== "SUBMITTED") {
      rec.state = rec.answers.length ? "REVIEW_READY" : "READY";
      await this.save(rec);
    }
    return this.view(rec);
  }

  // ---- Review --------------------------------------------------------------

  async getReview(sessionId: Id): Promise<Review> {
    const rec = await this.record(sessionId);
    if (rec.state !== "REVIEW_READY" && rec.state !== "REVIEWING") {
      throw new CompanionApiError(
        "INVALID_STATE",
        "Answer the questions first.",
        409,
        false,
      );
    }
    if (!rec.review)
      rec.review =
        rec.mode === "CONFIRMATION"
          ? await this.buildCardReview(rec)
          : await this.buildDiscoveryReview(rec);
    rec.state = "REVIEWING";
    await this.save(rec);
    return this.reviewView(rec);
  }

  private reviewView(rec: SessionRecord): Review {
    const r = rec.review!;
    if (r.kind === "cards") {
      return {
        sessionId: rec.id,
        mode: "CONFIRMATION",
        copy: {
          chip: "Our understanding · not confirmed",
          title: "Is this right?",
          subtitle:
            "These task cards describe work you do or own. Confirming says the description is accurate. It does not approve anything for the company.",
          submitLabel: "Confirm",
        },
        items: clone(r.items),
        canAddItems: false,
      };
    }
    if (r.kind === "words") {
      return {
        sessionId: rec.id,
        mode: "DISCOVERY",
        copy: {
          chip: "Your own words · not summarized",
          title: "Your words, as you gave them",
          subtitle: WORDS_COPY,
          submitLabel: "Send my words",
        },
        items: clone(r.items),
        canAddItems: false,
      };
    }
    return {
      sessionId: rec.id,
      mode: "DISCOVERY",
      copy: REVIEW_COPY.DISCOVERY,
      items: clone(r.items),
      canAddItems: false,
    };
  }

  private buildSourceText(rec: SessionRecord): string {
    return rec.answers
      .map(
        (a, i) =>
          `Question ${i + 1}: ${rec.questions[i]?.text ?? ""}\nAnswer: ${a.text}`,
      )
      .join("\n\n");
  }

  private sourceOf(rec: SessionRecord): {
    source: "typed" | "reviewed_transcript";
    transcriptJobId?: string;
  } {
    const voice = [...rec.answers]
      .reverse()
      .find((a) => a.source === "VOICE" && a.transcriptJobId);
    return voice
      ? {
          source: "reviewed_transcript",
          transcriptJobId: voice.transcriptJobId,
        }
      : { source: "typed" };
  }

  private async buildDiscoveryReview(
    rec: SessionRecord,
  ): Promise<NonNullable<SessionRecord["review"]>> {
    const sourceText = this.buildSourceText(rec);
    const utteranceIds = rec.answers.map((a) => a.utteranceId);
    const wordsOnly = (): NonNullable<SessionRecord["review"]> => ({
      kind: "words",
      sourceText,
      items: [
        {
          id: `${rec.id}-words`,
          sessionId: rec.id,
          category: "WORDS",
          label: "Your words",
          proposedText: sourceText,
          status: "PENDING",
          sourceUtteranceIds: utteranceIds,
          allowedActions: ["CONFIRM", "CHANGE"],
        },
      ],
    });
    let proposal: S["ProposedUnderstanding"];
    try {
      proposal = await this.api.post<S["ProposedUnderstanding"]>(
        `/requests/${encodeURIComponent(rec.requestId)}/understanding`,
        {
          expectedVersion: rec.version,
          contentHash: rec.contentHash,
          sourceText,
          ...this.sourceOf(rec),
        },
        { idempotencyKey: this.newKey() },
      );
    } catch (e) {
      if (isUnderstandingUnavailable(e)) return wordsOnly();
      throw e;
    }
    if (!proposal.tasks.length) return wordsOnly();
    return {
      kind: "tasks",
      sourceText,
      understandingHash: proposal.contentHash,
      tasks: proposal.tasks as ProposedTaskDto[],
      items: proposal.tasks.map((t, i) =>
        proposedToItem(rec.id, t as ProposedTaskDto, i, utteranceIds),
      ),
    };
  }

  private async buildCardReview(
    rec: SessionRecord,
  ): Promise<NonNullable<SessionRecord["review"]>> {
    const cards = await Promise.all(
      rec.taskCardIds.map((id) =>
        this.api.get<TaskCardDto>(`/task-cards/${encodeURIComponent(id)}`),
      ),
    );
    const refs: CardRef[] = [];
    const items: InterpretationItem[] = cards.map((c) => {
      const itemId = `${rec.id}-card-${c.id}`;
      refs.push({
        itemId,
        cardId: c.id,
        version: c.version,
        hash: c.hash,
        alreadyAttested: !c.needsAttestation,
      });
      return {
        id: itemId,
        sessionId: rec.id,
        category: "TASK",
        label: "Task",
        proposedText: taskCardSentence(c),
        status: c.needsAttestation ? "PENDING" : "CONFIRMED",
        sourceUtteranceIds: [],
        allowedActions: c.needsAttestation ? ["CONFIRM"] : [],
      };
    });
    return { kind: "cards", sourceText: "", cards: refs, items };
  }

  async updateReviewItem(
    sessionId: Id,
    item: InterpretationItem,
  ): Promise<InterpretationItem> {
    const rec = await this.record(sessionId);
    const items = rec.review?.items;
    const at = items ? items.findIndex((x) => x.id === item.id) : -1;
    if (!items || at < 0)
      throw new CompanionApiError(
        "NOT_FOUND",
        "That item is no longer available.",
        404,
        false,
      );
    items[at] = { ...item };
    await this.save(rec);
    return clone(items[at]);
  }

  async submitReview(input: SubmitInput): Promise<SubmitResult> {
    const rec = await this.record(input.sessionId);
    if (!rec.review)
      throw new CompanionApiError(
        "INVALID_STATE",
        "Review your answers first.",
        409,
        false,
      );
    const result =
      rec.review.kind === "cards"
        ? await this.submitCards(rec, input)
        : await this.submitDiscovery(rec, input);
    rec.state = "SUBMITTED";
    rec.endedAt = result.acknowledgedAt;
    await this.save(rec, false);
    try {
      await localState.deleteSession(rec.id); // the words are the server's now
      await localState.addDone({
        id: rec.requestId,
        title: rec.title,
        completedAt: result.acknowledgedAt,
      });
    } catch {
      /* local bookkeeping only */
    }
    return result;
  }

  private reviewedText(item: InterpretationItem): string {
    return item.status === "CHANGED" && item.participantEditedText?.trim()
      ? item.participantEditedText.trim()
      : item.proposedText;
  }

  private async submitDiscovery(
    rec: SessionRecord,
    input: SubmitInput,
  ): Promise<SubmitResult> {
    const review = rec.review!;
    const byId = new Map(input.items.map((i) => [i.id, i]));
    const common = {
      expectedVersion: rec.version,
      contentHash: rec.contentHash,
      participantConfirmed: true as const,
      ...this.sourceOf(rec),
    };
    let body: Record<string, unknown>;
    if (review.kind === "words") {
      const item = byId.get(`${rec.id}-words`) ?? review.items[0];
      if (!item || (item.status !== "CONFIRMED" && item.status !== "CHANGED")) {
        throw new CompanionApiError(
          "NOT_CONFIRMED",
          "Read your words and confirm them before sending.",
          422,
          false,
        );
      }
      body = {
        ...common,
        text: this.reviewedText(item),
        understanding: null,
        understandingUnavailable: true,
        attestation: { requestContentHash: rec.contentHash },
      };
    } else {
      const tasks: Record<string, unknown>[] = [];
      (review.tasks ?? []).forEach((t, i) => {
        const item = byId.get(`${rec.id}-task-${i}`);
        // Rejected or unreviewed proposals are not sent as confirmed work.
        if (!item || (item.status !== "CONFIRMED" && item.status !== "CHANGED"))
          return;
        const edited =
          item.status === "CHANGED" && item.participantEditedText?.trim();
        const task: Record<string, unknown> = {
          title: t.title,
          duty: t.duty,
          inputs: t.inputs,
          instructions: edited
            ? item.participantEditedText!.trim().slice(0, 3000)
            : t.instructions,
          output: t.output,
          handoff: t.handoff,
          software: t.software,
          decision: "correct",
        };
        if (t.purpose !== undefined) task.purpose = t.purpose;
        if (t.trigger !== undefined) task.trigger = t.trigger;
        if (t.humanGate !== undefined) task.humanGate = t.humanGate;
        if (t.missingFields?.length) task.missingFields = t.missingFields;
        tasks.push(task);
      });
      body = {
        ...common,
        text: review.sourceText,
        understanding: { contentHash: review.understandingHash, tasks },
        attestation: {
          requestContentHash: rec.contentHash,
          understandingHash: review.understandingHash,
        },
      };
    }
    const res = await this.api.post<S["SubmitResult"]>(
      `/requests/${encodeURIComponent(rec.requestId)}/submit`,
      body,
      {
        idempotencyKey: input.idempotencyKey,
      },
    );
    const unreviewed =
      res.reviewState === "words_unreviewed" || review.kind === "words";
    return {
      sessionId: rec.id,
      acknowledgedAt: toLocalIso(this.now()),
      headline: "Sent. Thank you.",
      body: unreviewed
        ? "Your answer is saved. Your advisor will review it."
        : "Your confirmed answer is saved and with your advisor.",
    };
  }

  private async submitCards(
    rec: SessionRecord,
    input: SubmitInput,
  ): Promise<SubmitResult> {
    const refs = rec.review!.cards ?? [];
    const status = new Map(input.items.map((i) => [i.id, i.status]));
    let returned = false;
    let attested = 0;
    // Sequential: the last attestation of a check returns it to the advisor.
    for (const ref of refs) {
      if (ref.alreadyAttested || status.get(ref.itemId) !== "CONFIRMED")
        continue;
      const res = await this.api.post<S["AttestResult"]>(
        `/task-cards/${encodeURIComponent(ref.cardId)}/attest`,
        {
          recordVersion: ref.version,
          contentHash: ref.hash,
          decision: "correct",
          correction: null,
        },
        { idempotencyKey: `${input.idempotencyKey}:${ref.cardId}` },
      );
      attested += 1;
      if (res.checkReturned) returned = true;
    }
    if (!attested && !refs.some((r) => r.alreadyAttested)) {
      throw new CompanionApiError(
        "NOT_CONFIRMED",
        "Confirm at least one task first.",
        422,
        false,
      );
    }
    return {
      sessionId: rec.id,
      acknowledgedAt: toLocalIso(this.now()),
      headline: "Sent. Thank you.",
      body: returned
        ? "Your confirmations are recorded and this check has gone back to your advisor."
        : "Your confirmations are recorded.",
    };
  }

  // ---- Static / empty ------------------------------------------------------

  async getMeetings(): Promise<MeetingSummary[]> {
    if (!config.meetingsApiBaseUrl) return [];
    return this.extras.getMeetings();
  }
  async getWork(): Promise<WorkList> {
    return emptyWork();
  }
  async getChangeKinds(): Promise<ChangeKindOption[]> {
    return CHANGE_KINDS.map((k) => ({ ...k }));
  }

  // ---- Not in contract 1.1 -------------------------------------------------

  getPulse(id: Id): Promise<Pulse> {
    return this.extras.getPulse(id);
  }
  getTeamStatus(id: Id): Promise<TeamStatus> {
    return this.extras.getTeamStatus(id);
  }
  getMeeting(id: Id): Promise<MeetingDetail> {
    return this.extras.getMeeting(id);
  }
  getMeetingBrief(id: Id): Promise<MeetingBrief> {
    return this.extras.getMeetingBrief(id);
  }
  getLiveMeeting(_id: Id): Promise<LiveMeetingState> {
    return notAvailable();
  }
  startWrapUp(_id: Id): Promise<ConversationSession> {
    return notAvailable();
  }
  getCommitment(_id: Id): Promise<Commitment> {
    return notAvailable();
  }
  completeCommitment(_id: Id, _key: string): Promise<Commitment> {
    return notAvailable();
  }
  getClarification(_id: Id): Promise<Clarification> {
    return notAvailable();
  }
  respondToClarification(
    _id: Id,
    _option: Id,
    _key: string,
  ): Promise<SubmitResult> {
    return notAvailable();
  }
  createChangeReport(_kind: ChangeKind): Promise<{ requestId: Id }> {
    return notAvailable();
  }

  // ---- Hands-free question cards (contract 1.2; spec §5) -----------------

  async getQuestionSet(requestId: Id): Promise<QuestionSet> {
    const pulseId = pulseIdFromRequest(requestId);
    if (pulseId) {
      const set = await this.extras.getPulseQuestions(pulseId);
      this.questionSets.set(requestId, set);
      return set;
    }
    const [d, me] = await Promise.all([
      this.api.get<QuestionDetailDto>(
        `/requests/${encodeURIComponent(requestId)}`,
      ),
      this.me ? Promise.resolve(this.me) : this.getMe(),
    ]);
    if (d.type === "leadership") {
      throw new CompanionApiError(
        "USE_WEB_LINK",
        "Open this one from your email link in the browser.",
        409,
        false,
      );
    }
    if (d.type !== "work" || !d.questions.length) {
      throw new CompanionApiError(
        "NO_QUESTIONS",
        "This request has no questions to answer.",
        409,
        false,
      );
    }
    if (!d.needsYou)
      throw new CompanionApiError(
        "REQUEST_CLOSED",
        "This request is no longer open.",
        409,
        false,
      );
    const set = mapQuestionSet(d, me.companyName);
    this.questionSets.set(set.requestId, set);
    return clone(set);
  }

  /** Never throws: no AI connection (501), limits (429), outages and lost connections are `available: false`. */
  async checkCoverage(input: CoverageCheckInput): Promise<ServerCoverage> {
    if (pulseIdFromRequest(input.requestId))
      return { available: false, reason: "LOCAL_ONLY" };
    const body = coverageBody(input);
    if (!body) return { available: false, reason: "NO_WORDS" };
    const hints = this.questionSets
      .get(input.requestId)
      ?.questions.find((q) => q.key === input.questionKey)?.hints;
    try {
      const dto = await this.api.post<CoverageDto>(
        `/requests/${encodeURIComponent(input.requestId)}/coverage`,
        body,
        {
          timeoutMs: COVERAGE_TIMEOUT_MS,
        },
      );
      return mapCoverage(dto, hints);
    } catch (e) {
      return { available: false, reason: errorCode(e) };
    }
  }

  /** Never throws: when the server cannot polish the words, the review shows the person's own. */
  async understandAnswers(input: UnderstandInput): Promise<UnderstandResult> {
    if (pulseIdFromRequest(input.requestId))
      return { available: false, reason: "OWN_WORDS" };
    const body = understandBody(input);
    if (!body.answers.length) return { available: false, reason: "NO_WORDS" };
    try {
      const dto = await this.api.post<UnderstandDto>(
        `/requests/${encodeURIComponent(input.requestId)}/understand`,
        body,
        {
          timeoutMs: UNDERSTAND_TIMEOUT_MS,
        },
      );
      return mapUnderstood(
        dto,
        body.answers.map((a) => a.key),
      );
    } catch (e) {
      return { available: false, reason: errorCode(e) };
    }
  }

  /**
   * Sends the reviewed answers on the words path with the web team page's per-question fields.
   * The submission is saved on the device before the first attempt and kept until the server
   * acknowledges it; a retry of the same answers reuses the saved Idempotency-Key.
   */
  submitAnswers(input: SubmitAnswersInput): Promise<SubmitAnswersResult> {
    const running = this.sending.get(input.requestId);
    if (running) return running;
    const p = this.sendAnswers(input).finally(() => {
      if (this.sending.get(input.requestId) === p)
        this.sending.delete(input.requestId);
    });
    this.sending.set(input.requestId, p);
    return p;
  }

  private async sendAnswers(
    input: SubmitAnswersInput,
  ): Promise<SubmitAnswersResult> {
    const owner = getParticipantSessionGeneration();
    const s = input.submission;
    const hasAnswer =
      !!(s.questionAnswers && Object.keys(s.questionAnswers).length) ||
      !!s.responseText?.trim();
    if (!hasAnswer)
      throw new CompanionApiError(
        "NOTHING_TO_SEND",
        "Answer at least one question first.",
        422,
        false,
      );
    const saved = await pendingAnswers.get(input.requestId);
    assertParticipantGeneration(owner);
    const pending =
      saved && sameAnswers(saved, input)
        ? saved
        : {
            requestId: input.requestId,
            idempotencyKey: input.idempotencyKey,
            expectedVersion: input.expectedVersion,
            contentHash: input.contentHash,
            submission: input.submission,
            savedAt: toLocalIso(this.now()),
            attempts: 0,
          };
    await pendingAnswers.save(pending);
    assertParticipantGeneration(owner);
    let res: S["SubmitResult"];
    try {
      if (pulseIdFromRequest(input.requestId)) {
        const result = await this.extras.submitPulse({
          ...input,
          idempotencyKey: pending.idempotencyKey,
        });
        await pendingAnswers.remove(input.requestId);
        return result;
      }
      res = await this.api.post<S["SubmitResult"]>(
        `/requests/${encodeURIComponent(input.requestId)}/submit`,
        submitAnswersBody(input),
        { idempotencyKey: pending.idempotencyKey },
      );
    } catch (e) {
      if (owner !== getParticipantSessionGeneration()) throw e;
      try {
        if (isTerminalAnswersError(e))
          await pendingAnswers.remove(input.requestId);
        else
          await pendingAnswers.save({
            ...pending,
            attempts: pending.attempts + 1,
          });
      } catch {
        /* the error below matters more */
      }
      throw e;
    }
    try {
      await pendingAnswers.remove(input.requestId);
      const title =
        this.questionSets.get(input.requestId)?.title ?? "Questions answered";
      await localState.addDone({
        id: input.requestId,
        title,
        completedAt: toLocalIso(this.now()),
      });
    } catch {
      /* local bookkeeping only */
    }
    this.questionSets.delete(input.requestId);
    return {
      responseId: res.responseId,
      requestId: res.requestId,
      idempotentReplay: res.idempotentReplay,
    };
  }
}

export function createHttpRepository(): CompanionRepository {
  return new HttpCompanionRepository();
}
