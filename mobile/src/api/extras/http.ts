import { buildQuestions } from "@shared/hands-free/hints";
import { NOT_AVAILABLE_MESSAGE } from "../http/errors";
import type { ConfigWire, PulseWire } from "../dutygraphWire";
import { config } from "../config";
import { Platform } from "react-native";
import { ApiClient, TRANSCRIBE_TIMEOUT_MS } from "../http/client";
import { coverageBody, submitAnswersBody } from "../http/handsFree";
import { tokenStore } from "@/storage/tokens";
import { CompanionApiError, type Pulse, type TeamStatus } from "@/types/domain";
import type {
  QuestionSet,
  SubmitAnswersInput,
  SubmitAnswersResult,
} from "@/types/handsfree";
import { newIdempotencyKey } from "@/utils/id";
import {
  taskDecisionGeneration,
  assertTaskDecisionGeneration,
  pendingTaskDecisions,
  removeTaskDecision,
  saveTaskDecision,
} from "./pending";
import type {
  LiveTranscriptionGrant,
  ParticipantExtrasRepository,
  PulseDto,
  TaskCardRecord,
  TaskDecisionInput,
  TaskDecisionResult,
  VoiceLinesInput,
  VoiceLinesResult,
} from "./types";
export const pulseRequestId = (id: string) => `pulse:${id}`;
export const pulseIdFromRequest = (id: string) =>
  id.startsWith("pulse:") ? id.slice(6) : null;
export function pulseQuestionSet(p: PulseDto): QuestionSet {
  const questions = buildQuestions(
    p.questions.map((q) => q.text),
    { advisorName: p.advisorName ?? "" },
  );
  p.questions.forEach((q, i) => {
    if (q.short) questions[i].short = q.short;
    if (q.hints) questions[i].hints = q.hints;
  });
  return {
    requestId: pulseRequestId(p.id),
    version: p.version,
    contentHash: p.contentHash,
    title: p.title,
    advisorName: p.advisorName ?? "",
    companyName: p.companyName ?? "",
    dueDate: p.dueAt.slice(0, 10),
    estimatedMinutes:
      p.estimateMinutes ?? Math.ceil(p.questions.length / 2 + 1),
    questions,
    whyAsked: [
      "This Pulse collects your update so the team can decide if a meeting is needed.",
      "Your words are processed while you speak. Review your answers before you send.",
    ],
  };
}
export function mapPulse(p: PulseDto): Pulse {
  return {
    id: p.id,
    requestId: pulseRequestId(p.id),
    title: p.title,
    purpose: "Share your own work update.",
    desiredOutcome: "A clear update from each person.",
    dueAt: p.dueAt,
    questionCount: p.questions.length,
    estimatedMinutes:
      p.estimateMinutes ?? Math.ceil(p.questions.length / 2 + 1),
    status: ["complete", "returned"].includes(p.state)
      ? "COMPLETE"
      : p.state === "in_progress"
        ? "IN_PROGRESS"
        : "NOT_STARTED",
    whyAsked: pulseQuestionSet(p).whyAsked,
    teamStatusVisible: p.teamStatusVisible !== false,
  };
}
export class HttpParticipantExtrasRepository implements ParticipantExtrasRepository {
  async getInbox() {
    const [pulseResult, confirmationResult, meetingResult] =
      await Promise.allSettled([
        this.api.get<{ pulses: PulseDto[] }>("/pulses", this.options()),
        this.api.get<{
          confirmations: import("./types").ConfirmationSummary[];
        }>("/confirmations", this.options()),
        this.api.get<{ meetings: import("@/types/domain").MeetingSummary[] }>(
          "/meetings",
          this.options(),
        ),
      ]);
    return {
      meetings:
        meetingResult.status === "fulfilled"
          ? meetingResult.value.meetings
          : [],
      pulses:
        pulseResult.status === "fulfilled" ? pulseResult.value.pulses : [],
      confirmations:
        confirmationResult.status === "fulfilled"
          ? confirmationResult.value.confirmations
          : [],
    };
  }
  async getMeetings() {
    const r = await this.api.get<{
      meetings: import("@/types/domain").MeetingSummary[];
    }>("/meetings", this.options());
    return r.meetings;
  }
  async getMeeting(id: string) {
    return this.api.get<import("@/types/domain").MeetingDetail>(
      `/meetings/${encodeURIComponent(id)}`,
      this.options(),
    );
  }
  async getMeetingBrief(id: string) {
    return this.api.get<import("@/types/domain").MeetingBrief>(
      `/meetings/${encodeURIComponent(id)}/brief`,
      this.options(),
    );
  }
  async getConfirmation(id: string) {
    return this.api.get<import("./types").ParticipantConfirmation>(
      `/confirmations/${encodeURIComponent(id)}`,
      this.options(),
    );
  }
  async decideConfirmation(input: import("./types").ConfirmationDecisionInput) {
    const { id, itemId, idempotencyKey, ...body } = input;
    await this.api.post(
      `/confirmations/${encodeURIComponent(id)}/items/${encodeURIComponent(itemId)}`,
      body,
      { ...this.options(), idempotencyKey },
    );
  }
  async checkCoverage(
    input: import("@/types/handsfree").CoverageCheckInput,
  ): Promise<import("@/types/handsfree").ServerCoverage> {
    const body = coverageBody(input);
    if (!body) return { available: false, reason: "NO_WORDS" };
    try {
      const r = await this.api.post<{
        available: boolean;
        covered?: string[];
        reason?: string;
        followUp?: { text: string; hintId: string };
      }>(`/requests/${encodeURIComponent(input.requestId)}/coverage`, body, {
        ...this.options(),
        timeoutMs: 5000,
      });
      if (!r.available || !Array.isArray(r.covered))
        return { available: false, reason: r.reason ?? "UNAVAILABLE" };
      const followUp =
        r.followUp &&
        typeof r.followUp.text === "string" &&
        typeof r.followUp.hintId === "string" &&
        r.followUp.text.length <= 400
          ? r.followUp
          : undefined;
      const result = {
        covered: r.covered.filter((id) => typeof id === "string"),
        nudge: null,
        source: "server" as const,
        ...(followUp ? { followUp } : {}),
      };
      return { available: true, result };
    } catch (e) {
      return {
        available: false,
        reason: e instanceof CompanionApiError ? e.code : "UNAVAILABLE",
      };
    }
  }
  async getConfig() {
    try {
      const value = await this.api.get<ConfigWire>("/config", this.options());
      return {
        ...value,
        followUps:
          value.followUps === "ai" ? ("ai" as const) : ("table" as const),
      };
    } catch {
      return {
        speakQuestions: true,
        followUps: "table" as const,
        autoAdvance: false,
        liveTranscription: false,
      };
    }
  }
  constructor(
    private api = new ApiClient(),
    private origin = config.meetingsApiBaseUrl,
  ) {}
  private options() {
    if (!this.origin)
      throw new CompanionApiError(
        "NOT_AVAILABLE",
        NOT_AVAILABLE_MESSAGE,
        501,
        false,
      );
    return { apiBaseUrl: `${this.origin}/api/mobile/v1x` };
  }
  async transcribeCardBackup(input: {
    requestId: string;
    uri: string;
    mimeType: string;
    durationMs: number;
  }): Promise<{ text: string }> {
    if (pulseIdFromRequest(input.requestId))
      throw new CompanionApiError(
        "NOT_AVAILABLE",
        "Type your answer while transcription is unavailable.",
        501,
        false,
      );
    const detail = await this.api.get<{ version: number; contentHash: string }>(
      `/requests/${encodeURIComponent(input.requestId)}`,
    );
    const form = new FormData();
    const name = input.mimeType.includes("webm")
      ? "answer.webm"
      : input.mimeType.includes("wav")
        ? "answer.wav"
        : "answer.m4a";
    if (Platform.OS === "web") {
      const clip = await fetch(input.uri);
      form.append("audio", await clip.blob(), name);
    } else
      form.append("audio", {
        uri: input.uri,
        name,
        type: input.mimeType,
      } as any);
    form.append(
      "meta",
      JSON.stringify({
        expectedVersion: detail.version,
        contentHash: detail.contentHash,
        consent: true,
      }),
    );
    const res = await this.api.request<{
      job: { state: string };
      text?: string;
    }>(
      "POST",
      `/requests/${encodeURIComponent(input.requestId)}/transcriptions`,
      {
        formData: form,
        idempotencyKey: newIdempotencyKey(),
        timeoutMs: TRANSCRIBE_TIMEOUT_MS,
      },
    );
    if (res.job.state !== "complete" || !res.text?.trim())
      throw new CompanionApiError(
        "TRANSCRIPTION_FAILED",
        "Your recording is saved. Try transcription again.",
        502,
        true,
      );
    return { text: res.text };
  }
  async getVoiceLines(input: VoiceLinesInput): Promise<VoiceLinesResult> {
    const result = await this.api.post<VoiceLinesResult>(
      "/voice/lines",
      input,
      { ...this.options(), idempotencyKey: newIdempotencyKey() },
    );
    return {
      lines: result.lines.map((l) => ({ ...l, url: this.safeAudioUrl(l.url) })),
    };
  }
  private safeAudioUrl(url: string) {
    const target = new URL(url, this.origin);
    if (
      target.origin !== new URL(this.origin).origin ||
      !target.pathname.startsWith("/api/mobile/v1x/voice/audio/")
    )
      throw new CompanionApiError(
        "BAD_RESPONSE",
        "The voice file is not available.",
        502,
        false,
      );
    return target.toString();
  }
  async getVoiceDownloadHeaders(): Promise<Record<string, string>> {
    const session = await tokenStore.get();
    return session ? { Authorization: `Bearer ${session.accessToken}` } : {};
  }
  async createLiveTranscriptionGrant(
    requestId: string,
  ): Promise<LiveTranscriptionGrant> {
    try {
      const r = await this.api.post<Record<string, any>>(
        `/requests/${encodeURIComponent(requestId)}/live-transcription`,
        {},
        { ...this.options(), idempotencyKey: newIdempotencyKey() },
      );
      if (r.available !== true) return { available: false, reason: r.reason };
      return {
        available: true,
        secret: r.clientSecret ?? r.secret,
        url: r.wsUrl ?? r.url,
        model: r.model,
        keywords: r.keywords,
        expiresAt:
          typeof r.expiresAt === "number"
            ? r.expiresAt
            : Date.parse(r.expiresAt),
      };
    } catch (e) {
      return {
        available: false,
        reason: e instanceof CompanionApiError ? e.code : "UNAVAILABLE",
      };
    }
  }
  async getTaskCards(requestId: string): Promise<TaskCardRecord[]> {
    const d = await this.api.get<{ taskCardIds?: string[] }>(
      `/requests/${encodeURIComponent(requestId)}`,
    );
    if (d.taskCardIds)
      return Promise.all(
        d.taskCardIds.map((id) =>
          this.api.get<TaskCardRecord>(`/task-cards/${encodeURIComponent(id)}`),
        ),
      );
    throw new CompanionApiError(
      "NOT_AVAILABLE",
      "This request does not include Task Cards yet.",
      501,
      false,
    );
  }
  async decideTaskCard(input: TaskDecisionInput): Promise<TaskDecisionResult> {
    const owner = taskDecisionGeneration();
    const prior = (await pendingTaskDecisions()).find(
      (p) => p.taskCardId === input.taskCardId,
    );
    const same =
      prior &&
      prior.decision === input.decision &&
      prior.note === input.note &&
      prior.recordVersion === input.recordVersion &&
      prior.contentHash === input.contentHash;
    const saved = same ? prior : input;
    assertTaskDecisionGeneration(owner);
    await saveTaskDecision(saved, owner);
    assertTaskDecisionGeneration(owner);
    try {
      const body = {
        recordVersion: saved.recordVersion,
        contentHash: saved.contentHash,
        decision: saved.decision,
        ...(saved.decision === "correct"
          ? { correction: null }
          : saved.note
            ? { note: saved.note }
            : {}),
      };
      if (saved.decision === "correct")
        await this.api.post(
          `/task-cards/${encodeURIComponent(saved.taskCardId)}/attest`,
          body,
          { idempotencyKey: saved.idempotencyKey },
        );
      else
        await this.api.post(
          `/task-cards/${encodeURIComponent(saved.taskCardId)}/decision`,
          body,
          { ...this.options(), idempotencyKey: saved.idempotencyKey },
        );
      assertTaskDecisionGeneration(owner);
      await removeTaskDecision(saved.idempotencyKey, owner);
      return {
        acknowledged: true,
        pending: false,
        taskCardId: saved.taskCardId,
      };
    } catch (e) {
      if (
        e instanceof CompanionApiError &&
        (e.code === "NOT_AVAILABLE" || e.status === 404 || e.status === 501)
      )
        return {
          acknowledged: false,
          pending: true,
          taskCardId: saved.taskCardId,
          message: "Your advisor will see this when your app is updated.",
        };
      throw e;
    }
  }
  getPendingTaskDecisions = pendingTaskDecisions;
  async retryPendingTaskDecisions() {
    const results: TaskDecisionResult[] = [];
    const owner = taskDecisionGeneration();
    for (const input of await pendingTaskDecisions()) {
      if (owner !== taskDecisionGeneration()) break;
      try {
        results.push(await this.decideTaskCard(input));
      } catch (e) {
        if (e instanceof CompanionApiError && e.status === 401) throw e;
      }
    }
    return results;
  }
  private async getPulseDto(id: string) {
    const value = await this.api.get<PulseWire>(
      `/pulses/${encodeURIComponent(id)}`,
      this.options(),
    );
    if (typeof value.contentHash !== "string")
      throw new CompanionApiError(
        "INVALID_RESPONSE",
        "The Pulse could not be read.",
        502,
        false,
      );
    return {
      ...value,
      meetingId: value.meetingId ?? undefined,
      contentHash: value.contentHash,
      advisorName:
        typeof value.advisorName === "string" ? value.advisorName : "",
      companyName:
        typeof value.companyName === "string" ? value.companyName : "",
    };
  }
  async getPulse(id: string) {
    return mapPulse(await this.getPulseDto(id));
  }
  async getPulseQuestions(id: string) {
    return pulseQuestionSet(await this.getPulseDto(id));
  }
  async getTeamStatus(id: string): Promise<TeamStatus> {
    const r = await this.api.get<{
      total: number;
      done: number;
      people?: { name: string; state: string; id?: string; isYou?: boolean }[];
      participants?: {
        name: string;
        state: string;
        id?: string;
        isYou?: boolean;
      }[];
    }>(`/pulses/${encodeURIComponent(id)}/team-status`, this.options());
    const p = await this.getPulseDto(id);
    // Build an allow-listed completion DTO. No answer text crosses this boundary.
    return {
      pulseId: id,
      title: p.title,
      dueAt: p.dueAt,
      completeCount: r.done,
      totalCount: r.total,
      note: "Team completion only. Answers stay private.",
      rows: (r.people ?? r.participants ?? []).map((x, i) => ({
        participantId: x.id ?? `person-${i}`,
        displayName: x.name,
        isYou: x.isYou === true,
        status: ["complete", "done", "returned"].includes(x.state)
          ? "COMPLETE"
          : x.state === "in_progress"
            ? "IN_PROGRESS"
            : "NOT_STARTED",
      })),
    };
  }
  async submitPulse(input: SubmitAnswersInput): Promise<SubmitAnswersResult> {
    const id = pulseIdFromRequest(input.requestId) ?? input.requestId;
    const result = await this.api.post<SubmitAnswersResult>(
      `/pulses/${encodeURIComponent(id)}/responses`,
      submitAnswersBody(input),
      { ...this.options(), idempotencyKey: input.idempotencyKey },
    );
    return { ...result, requestId: input.requestId };
  }
}
