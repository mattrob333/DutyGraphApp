import type {
  AdvisorRepository,
  AdvisorSession,
  CreateMeeting,
  MeetingDefinition,
  MeetingSession,
  SessionDetail,
  Person,
  MeetingProposal,
  PulseStatus,
  Coach,
  Trigger,
  ClosingItem,
  SaveClosing,
} from "./types";
import type {
  SpeakerMap,
  KickoffNote,
  SetupProposal,
} from "../../../../shared/meetings/types";
import {
  advisorTokens,
  clearAdvisorData,
  loadAdvisorDraft,
  saveAdvisorDraft,
  advisorSessionGeneration,
} from "@/storage/advisor";
import {
  CompanionApiError,
  errorFromResponse,
  networkOffline,
  notAvailable,
  requestTimeout,
} from "@/api/http/errors";
import { newIdempotencyKey } from "@/utils/id";
import * as Crypto from "expo-crypto";
import { useAdvisorStore } from "@/state/advisor";
import { config } from "@/api/config";
import type {
  AdvisorSessionWire,
  MeetingWire,
  SessionWire,
  PeopleWire,
  MeetingRouteWire,
  MobileFinishJobWire,
  MeetingGateSuggestionWire,
  MeetingTaskCardWire,
} from "@/api/dutygraphWire";

export class HttpAdvisorRepository implements AdvisorRepository {
  readonly kind = "http" as const;
  private refreshing: Promise<AdvisorSession> | null = null;
  private refreshKey: { token: string; key: string } | null = null;
  constructor(
    private origin: string | undefined,
    private versionedCommands = config.backendProfile.startsWith("dutygraph-"),
  ) {}
  private async request<T>(
    path: string,
    method = "GET",
    body?: unknown,
    key?: string,
    authorized = true,
    retry = true,
    namespace = "/api/mobile/meetings/v1",
    timeoutMs = 20000,
    callerSignal?: AbortSignal,
  ): Promise<T> {
    if (!this.origin) return notAvailable();
    const assertNotCancelled = () => {
      if (callerSignal?.aborted)
        throw new CompanionApiError(
          "COMMAND_PENDING",
          "Checking paused. The server can continue processing. Tap Review closing to check the same attempt.",
          0,
          true,
        );
    };
    assertNotCancelled();
    const generation = advisorSessionGeneration();
    const assertCurrent = () => {
      if (generation !== advisorSessionGeneration())
        throw new CompanionApiError(
          "SESSION_ENDED",
          "Pair this phone again to continue.",
          0,
          false,
        );
    };
    let session = authorized ? await advisorTokens.get() : null;
    if (authorized && !session)
      throw new CompanionApiError(
        "SESSION_ENDED",
        "Pair this phone again to continue.",
        401,
        false,
      );
    if (session && Date.parse(session.accessExpiresAt) < Date.now() + 30000)
      session = await this.refresh();
    assertNotCancelled();
    assertCurrent();
    const abort = new AbortController(),
      timer = setTimeout(() => abort.abort(), timeoutMs),
      cancel = () => abort.abort();
    callerSignal?.addEventListener("abort", cancel, { once: true });
    if (callerSignal?.aborted) abort.abort();
    let response: Response;
    try {
      try {
        response = await fetch(
          `${this.origin.replace(/\/+$/, "")}${namespace}${path}`,
          {
            method,
            signal: abort.signal,
            headers: {
              Accept: "application/json",
              ...(body === undefined
                ? {}
                : { "Content-Type": "application/json" }),
              ...(session
                ? { Authorization: `Bearer ${session.accessToken}` }
                : {}),
              ...(key ? { "Idempotency-Key": key } : {}),
            },
            body: body === undefined ? undefined : JSON.stringify(body),
          },
        );
      } catch {
        assertNotCancelled();
        throw abort.signal.aborted ? requestTimeout() : networkOffline();
      }
      assertNotCancelled();
      assertCurrent();
      const readBody = async () => {
        try {
          const raw = await response.text();
          assertNotCancelled();
          assertCurrent();
          return raw;
        } catch (error) {
          assertNotCancelled();
          if (abort.signal.aborted) throw requestTimeout();
          if (error instanceof CompanionApiError) throw error;
          throw networkOffline();
        }
      };
      if (response.status === 401 && authorized && retry) {
        await this.refresh();
        return this.request(
          path,
          method,
          body,
          key,
          authorized,
          false,
          namespace,
          timeoutMs,
          callerSignal,
        );
      }
      if (response.status === 404 || response.status === 501)
        return notAvailable();
      if (!response.ok) {
        const error = errorFromResponse(response.status, await readBody());
        assertCurrent();
        if (
          error.code === "REFRESH_REPLAY" ||
          (response.status === 401 &&
            (authorized || path === "/advisor/session/refresh"))
        )
          await useAdvisorStore.getState().clear();
        throw error;
      }
      if (response.status === 204) return undefined as T;
      const raw = await readBody();
      assertCurrent();
      return raw ? (JSON.parse(raw) as T) : (undefined as T);
    } finally {
      clearTimeout(timer);
      callerSignal?.removeEventListener("abort", cancel);
    }
  }
  private refresh(): Promise<AdvisorSession> {
    if (!this.refreshing)
      this.refreshing = (async () => {
        const generation = advisorSessionGeneration();
        const s = await advisorTokens.get();
        if (!s)
          throw new CompanionApiError(
            "SESSION_ENDED",
            "Pair this phone again to continue.",
            401,
            false,
          );
        this.refreshKey ??= await loadAdvisorDraft<{
          token: string;
          key: string;
        }>("refresh-key");
        if (this.refreshKey?.token !== s.refreshToken)
          this.refreshKey = { token: s.refreshToken, key: newIdempotencyKey() };
        await saveAdvisorDraft("refresh-key", this.refreshKey);
        try {
          const next = await this.request<AdvisorSessionWire>(
            "/advisor/session/refresh",
            "POST",
            { refreshToken: s.refreshToken },
            this.refreshKey.key,
            false,
            false,
          );
          if (generation !== advisorSessionGeneration())
            throw new CompanionApiError(
              "SESSION_ENDED",
              "Pair this phone again to continue.",
              0,
              false,
            );
          await advisorTokens.set(next, generation);
          this.refreshKey = null;
          await saveAdvisorDraft("refresh-key", null);
          return next;
        } catch (e) {
          if (
            generation === advisorSessionGeneration() &&
            e instanceof CompanionApiError &&
            (e.status === 401 || e.code === "REFRESH_REPLAY")
          ) {
            await clearAdvisorData();

            await useAdvisorStore.getState().clear();
          }
          throw e;
        }
      })().finally(() => {
        this.refreshing = null;
      });
    return this.refreshing;
  }
  pair(pairingCode: string, key: string) {
    return this.request<AdvisorSessionWire>(
      "/advisor/pair",
      "POST",
      { pairingCode, deviceLabel: "DutyGraph Companion" },
      key,
      false,
    );
  }
  voiceLines(
    input: { lines: { id: string; text: string }[]; speed?: number },
    key: string,
  ) {
    return this.request<{
      lines: {
        id: string;
        url: string;
        hash: string;
        durationMs: number;
        mimeType?: "audio/mpeg" | "audio/wav";
        simulated?: boolean;
      }[];
    }>("/voice/lines", "POST", input, key, true, true, "/api/mobile/v1x");
  }
  async logout(key: string) {
    // End local access before waiting for an unreliable connection. Revocation
    // uses this snapshot only; its response cannot mutate a later login.
    const session = await advisorTokens.get();
    await useAdvisorStore.getState().clear();
    if (!this.origin) return notAvailable();
    if (!session) return;
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 20000);
    try {
      const response = await fetch(
        `${this.origin.replace(/\/+$/, "")}/api/mobile/meetings/v1/advisor/session/logout`,
        {
          method: "POST",
          signal: abort.signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.accessToken}`,
            "Idempotency-Key": key,
          },
          body: "{}",
        },
      );
      if (!response.ok && response.status !== 401)
        throw errorFromResponse(response.status, await response.text());
    } catch (error) {
      if (error instanceof CompanionApiError) throw error;
      throw networkOffline();
    } finally {
      clearTimeout(timer);
    }
  }
  async people() {
    return (await this.request<PeopleWire>("/people")).people.map(
      (person): Person => {
        if (
          typeof person.id !== "string" ||
          typeof person.name !== "string" ||
          typeof person.role !== "string" ||
          typeof person.department !== "string"
        )
          throw new CompanionApiError(
            "INVALID_RESPONSE",
            "The company people list could not be read.",
            502,
            false,
          );
        return {
          id: person.id,
          name: person.name,
          role: person.role,
          department: person.department,
        };
      },
    );
  }
  async taskCards() {
    return (
      await this.request<{ taskCards: MeetingTaskCardWire[] }>("/task-cards")
    ).taskCards;
  }
  taskCard(id: string) {
    return this.request<MeetingTaskCardWire>(
      `/task-cards/${encodeURIComponent(id)}`,
    );
  }
  async meetings() {
    return (await this.request<{ meetings: MeetingDefinition[] }>("/meetings"))
      .meetings;
  }
  meeting(id: string) {
    return this.request<MeetingWire>(`/meetings/${encodeURIComponent(id)}`);
  }
  create(input: CreateMeeting, key: string) {
    return this.request<MeetingDefinition>("/meetings", "POST", input, key);
  }
  patch(
    id: string,
    input: Partial<CreateMeeting> & {
      expectedVersion: number;
      contentHash?: string;
    },
    key: string,
  ) {
    const { contentHash, ...legacy } = input;
    if (this.versionedCommands && !contentHash)
      return Promise.reject(
        new CompanionApiError(
          "VERSION_REQUIRED",
          "Load the current meeting before editing.",
          409,
          false,
        ),
      );
    return this.request<MeetingDefinition>(
      `/meetings/${encodeURIComponent(id)}`,
      "PATCH",
      this.versionedCommands ? input : legacy,
      key,
    );
  }
  async plan(id: string, key: string) {
    return (
      await this.request<{ meeting: MeetingDefinition }>(
        `/meetings/${encodeURIComponent(id)}/plan`,
        "POST",
        {},
        key,
      )
    ).meeting;
  }
  gateSuggestion(id: string, key: string) {
    return this.request<MeetingGateSuggestionWire>(
      `/meetings/${encodeURIComponent(id)}/gate-suggestion`,
      "POST",
      {},
      key,
    );
  }
  route(
    id: string,
    choice: "pulse" | "shorter" | "as_planned",
    key: string,
    reviewed?: Pick<MeetingDefinition, "version" | "hash">,
  ) {
    if (this.versionedCommands && !reviewed)
      return Promise.reject(
        new CompanionApiError(
          "VERSION_REQUIRED",
          "Load the current meeting before choosing its route.",
          409,
          false,
        ),
      );
    const body =
      this.versionedCommands && reviewed
        ? ({
            choice,
            expectedVersion: reviewed.version,
            contentHash: reviewed.hash,
          } satisfies MeetingRouteWire)
        : { choice };
    return this.request<MeetingDefinition>(
      `/meetings/${encodeURIComponent(id)}/route`,
      "POST",
      body,
      key,
    );
  }
  async pulse(id: string, create = false, key?: string) {
    const value = await this.request<
      PulseStatus & {
        status?: PulseStatus;
        pulses?: import("../../../../shared/meetings/types").Pulse[];
        perPerson?: import("../../../../shared/meetings/types").Pulse["perPerson"];
      }
    >(
      `/meetings/${encodeURIComponent(id)}/pulse`,
      create ? "POST" : "GET",
      create ? {} : undefined,
      key,
    );
    if (value.status) return value.status;
    if (typeof value.total === "number") return value;
    const latest = value.pulses?.at(-1);
    const perPerson = latest?.perPerson ?? value.perPerson;
    if (!perPerson) return { total: 0, done: 0, people: [], gate: value.gate };
    const people = await this.people();
    return {
      id: latest?.id ?? value.id,
      total: perPerson.length,
      done: perPerson.filter((p) => p.state === "complete").length,
      people: perPerson.map((p) => ({
        name:
          people.find((person) => person.id === p.personId)?.name ??
          "Participant",
        state: p.state,
      })),
      gate: value.gate,
    };
  }
  start(
    id: string,
    mode: MeetingSession["mode"],
    key: string,
    voice: "tts_lines" | "realtime" = "tts_lines",
  ) {
    return this.request<MeetingSession>(
      `/meetings/${encodeURIComponent(id)}/sessions`,
      "POST",
      { mode, voice: mode === "facilitator" ? voice : undefined },
      key,
    );
  }
  realtime(id: string, input: { sdp: string; summary?: string }, key: string) {
    return this.request<
      import("@/features/voice/meeting/realtime/types").RealtimeGrant
    >(`/sessions/${encodeURIComponent(id)}/realtime`, "POST", input, key);
  }
  session(id: string) {
    return this.request<SessionWire>(`/sessions/${encodeURIComponent(id)}`);
  }
  consent(id: string, attendees: MeetingSession["consents"], key: string) {
    return this.request<MeetingSession>(
      `/sessions/${encodeURIComponent(id)}/consent`,
      "POST",
      {
        attendees: attendees.map((a) => ({
          personKey: a.personKey,
          state: a.state,
          at: a.at,
        })),
        noticeVersion: "draft-1",
        appVersion: "0.1.0",
      },
      key,
    );
  }
  async transcript(
    id: string,
    segments: import("./types").TranscriptInput[],
    key: string,
  ) {
    await this.request(
      `/sessions/${encodeURIComponent(id)}/transcript`,
      "POST",
      {
        segments: segments.map(
          ({ sessionId: _sessionId, ...segment }) => segment,
        ),
      },
      key,
    );
  }
  async coach(id: string, key: string) {
    const result = await this.request<
      Omit<Coach, "flags"> & { flags: (string | { text: string })[] }
    >(`/sessions/${encodeURIComponent(id)}/coach`, "POST", {}, key);
    return {
      ...result,
      flags: result.flags.map((f) => (typeof f === "string" ? f : f.text)),
    };
  }
  async park(id: string, text: string, atMs: number, key: string) {
    await this.request(
      `/sessions/${encodeURIComponent(id)}/park`,
      "POST",
      { text, atMs },
      key,
    );
  }
  turn(id: string, trigger: Trigger, key: string) {
    return this.request<{
      text: string;
      action: string;
      promptVersion: string;
    }>(
      `/sessions/${encodeURIComponent(id)}/facilitator/turn`,
      "POST",
      { trigger },
      key,
    );
  }
  async state(id: string, to: string, key: string) {
    await this.request(
      `/sessions/${encodeURIComponent(id)}/state`,
      "POST",
      { to },
      key,
    );
  }
  async control(
    id: string,
    control: "mute" | "unmute" | "stop" | "skip",
    key: string,
  ) {
    await this.request(
      `/sessions/${encodeURIComponent(id)}/state`,
      "POST",
      { control },
      key,
    );
  }
  async topic(id: string, topicId: string | null, key: string) {
    await this.request(
      `/sessions/${encodeURIComponent(id)}/topic`,
      "POST",
      { topicId },
      key,
    );
  }
  async uploadSegment(input: {
    sessionId: string;
    segment: { id: string; hash: string; bytes: number; durationMs: number };
    offset: number;
    bytes: Uint8Array;
    final: boolean;
  }) {
    const digest = await Crypto.digest(
      Crypto.CryptoDigestAlgorithm.SHA256,
      input.bytes as unknown as BufferSource,
    );
    const sha256 = [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const alphabet =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let data = "";
    for (let i = 0; i < input.bytes.length; i += 3) {
      const a = input.bytes[i],
        b = input.bytes[i + 1],
        c = input.bytes[i + 2],
        n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
      data +=
        alphabet[(n >>> 18) & 63] +
        alphabet[(n >>> 12) & 63] +
        (b === undefined ? "=" : alphabet[(n >>> 6) & 63]) +
        (c === undefined ? "=" : alphabet[n & 63]);
    }
    const chunkIndex = Math.floor(input.offset / (512 * 1024)),
      segmentIndex = Number(input.segment.id.split("-").at(-1));
    const ack = await this.request<{ uploadedChunks: number[] }>(
      `/sessions/${encodeURIComponent(input.sessionId)}/segments`,
      "POST",
      {
        segmentIndex,
        chunkIndex,
        chunkCount: Math.ceil(input.segment.bytes / (512 * 1024)),
        sha256,
        segmentSha256: input.segment.hash,
        data,
        durationMs: input.segment.durationMs,
      },
      `audio-${input.segment.id}-${chunkIndex}-${sha256}`,
    );
    if (!ack.uploadedChunks.includes(chunkIndex))
      throw new Error("The server did not acknowledge this recording part.");
    return { uploadedBytes: input.offset + input.bytes.length };
  }
  async finish(id: string, key: string, options?: { signal?: AbortSignal }) {
    // A minimal projection of the generated server DTOs; no transcript content is retained here.
    type Result = {
      job?: MobileFinishJobWire;
      session?: Pick<SessionWire, "endedAt">;
    };
    const generation = advisorSessionGeneration();
    const assertActive = () => {
      if (generation !== advisorSessionGeneration())
        throw new CompanionApiError(
          "SESSION_ENDED",
          "Pair this phone again to continue.",
          401,
          false,
        );
      if (options?.signal?.aborted)
        throw new CompanionApiError(
          "COMMAND_PENDING",
          "Checking paused. The server can continue processing. Tap Review closing to check the same attempt.",
          0,
          true,
        );
    };
    const pending = () =>
      new CompanionApiError(
        "COMMAND_PENDING",
        "The server is still preparing the review. You can leave and tap Review closing later to check the same attempt.",
        202,
        true,
      );
    const submit = async () => {
      assertActive();
      const result = await this.request<Result>(
        `/sessions/${encodeURIComponent(id)}/finish`,
        "POST",
        {},
        key,
        true,
        true,
        "/api/mobile/meetings/v1",
        this.versionedCommands ? 20000 : 210000,
        options?.signal,
      );
      assertActive();
      if (
        !result ||
        (!result.job && this.versionedCommands && !result.session?.endedAt)
      )
        throw new CompanionApiError(
          "INVALID_RESPONSE",
          "The server has not confirmed that the review is ready. Tap Review closing to check again.",
          0,
          true,
        );
      return result;
    };
    let result = await submit();
    if (!result.job) return; // The synchronous development API remains supported.
    const jobId = result.job.id;
    if (!jobId)
      throw new CompanionApiError(
        "INVALID_RESPONSE",
        "The server did not identify the finish attempt.",
        0,
        true,
      );
    const deadline = Date.now() + 60000;
    while (true) {
      assertActive();
      const job = result.job;
      if (!job) return;
      if (job.id !== jobId) throw pending();
      if (
        job.state === "needs_review" ||
        job.failureCode === "INTERRUPTED_DISPATCH"
      )
        throw new CompanionApiError(
          "FINISH_REVIEW_REQUIRED",
          "Processing needs an advisor review before another attempt. Your recording is retained.",
          409,
          false,
        );
      if (job.state === "failed")
        throw new CompanionApiError(
          "COMMAND_FAILED",
          "The finish attempt failed before processing. Your recording is retained.",
          409,
          false,
        );
      if (job.state === "complete") {
        // Bind completion to this command receipt, not merely the session's latest job.
        result = await submit();
        if (!result.job) return;
        throw pending();
      }
      if (!["queued", "running"].includes(job.state))
        throw new CompanionApiError(
          "INVALID_RESPONSE",
          "The server returned an unknown finish state.",
          0,
          true,
        );
      if (Date.now() >= deadline) throw pending();
      await new Promise<void>((resolve, reject) => {
        const cancel = () => {
          clearTimeout(timer);
          options?.signal?.removeEventListener("abort", cancel);
          reject(pending());
        };
        const timer = setTimeout(() => {
          options?.signal?.removeEventListener("abort", cancel);
          resolve();
        }, 1000);
        options?.signal?.addEventListener("abort", cancel, { once: true });
        if (options?.signal?.aborted) cancel();
      });
      assertActive();
      result = await this.request<Result>(
        `/sessions/${encodeURIComponent(id)}/finish-job`,
        "GET",
        undefined,
        undefined,
        true,
        true,
        "/api/mobile/meetings/v1",
        20000,
        options?.signal,
      );
      assertActive();
      if (!result?.job)
        throw new CompanionApiError(
          "INVALID_RESPONSE",
          "The server has not confirmed the finish state.",
          0,
          true,
        );
      if (result.job.id !== jobId) result = await submit();
    }
  }
  speakers(id: string, map: SpeakerMap, key: string) {
    return this.request<SpeakerMap>(
      `/sessions/${encodeURIComponent(id)}/speakers`,
      "POST",
      { entries: map.entries },
      key,
    );
  }
  decide(
    proposal: MeetingProposal,
    decision: "accept" | "reject" | "edit",
    key: string,
    body?: MeetingProposal["body"],
  ) {
    const text =
      body?.kind === "decision"
        ? body.decision
        : body?.kind === "action"
          ? body.what
          : body?.kind === "open_question"
            ? body.question
            : body?.kind === "claim"
              ? body.value
              : undefined;
    return this.request<MeetingProposal>(
      `/proposals/${encodeURIComponent(proposal.id)}/decision`,
      "POST",
      {
        decision,
        expectedVersion: proposal.version,
        contentHash: proposal.hash,
        ...(decision === "edit"
          ? {
              text,
              ...(text ? {} : { body }),
              sources: proposal.sources,
              ...(body?.kind === "action"
                ? { ownerPersonKey: body.ownerPersonKey, due: body.due }
                : {}),
            }
          : {}),
      },
      key,
    );
  }
  async confirm(sessionId: string, item: ClosingItem, key: string) {
    const { expectedVersion, contentHash, ...legacy } = item;
    if (this.versionedCommands && (!expectedVersion || !contentHash))
      throw new CompanionApiError(
        "VERSION_REQUIRED",
        "Load the current proposal before confirming.",
        409,
        false,
      );
    await this.request(
      `/sessions/${encodeURIComponent(sessionId)}/closing`,
      "POST",
      { items: [this.versionedCommands ? item : legacy] },
      key,
    );
  }
  async saveClosing(sessionId: string, input: SaveClosing, key: string) {
    await this.request(
      `/sessions/${encodeURIComponent(sessionId)}/closing`,
      "POST",
      input,
      key,
    );
  }
  async complete(
    sessionId: string,
    reviewed: { expectedVersion: number; contentHash: string },
    key: string,
  ): Promise<MeetingDefinition> {
    return this.request(
      `/sessions/${encodeURIComponent(sessionId)}/complete`,
      "POST",
      reviewed,
      key,
    );
  }
  async followUp(id: string, personId: string, key: string) {
    await this.request(
      `/proposals/${encodeURIComponent(id)}/follow-up`,
      "POST",
      { personId },
      key,
    );
  }
  export(id: string) {
    return this.request<{ markdown: string; json: unknown }>(
      `/sessions/${encodeURIComponent(id)}/export`,
    );
  }
  async audioSource(id: string, startMs: number) {
    if (!this.origin) return notAvailable();
    if (!Number.isFinite(startMs) || startMs < 0) return null;
    const manifest = await this.request<{
      segments: {
        segmentIndex: number;
        complete: boolean;
        durationMs: number;
      }[];
    }>(`/sessions/${encodeURIComponent(id)}/segments`);
    const segments = manifest.segments
      .filter((segment) => segment.complete)
      .sort((a, b) => a.segmentIndex - b.segmentIndex);
    let segmentIndex: number | null = null,
      offsetMs = startMs;
    for (const segment of segments) {
      if (
        !Number.isInteger(segment.segmentIndex) ||
        segment.segmentIndex < 0 ||
        !Number.isFinite(segment.durationMs) ||
        segment.durationMs <= 0
      )
        return null;
      if (offsetMs < segment.durationMs) {
        segmentIndex = segment.segmentIndex;
        break;
      }
      offsetMs -= segment.durationMs;
    }
    if (segmentIndex === null) return null;
    let session = await advisorTokens.get();
    if (!session)
      throw new CompanionApiError(
        "SESSION_ENDED",
        "Pair this phone again to continue.",
        401,
        false,
      );
    if (Date.parse(session.accessExpiresAt) < Date.now() + 30000)
      session = await this.refresh();
    const origin = new URL(this.origin);
    if (!["http:", "https:"].includes(origin.protocol)) return notAvailable();
    return {
      uri: `${origin.origin}/api/mobile/meetings/v1/sessions/${encodeURIComponent(id)}/audio/${segmentIndex}`,
      headers: { Authorization: `Bearer ${session.accessToken}` },
      offsetSeconds: offsetMs / 1000,
    };
  }
  async notes(id: string, notes: KickoffNote[], key: string) {
    const result = await this.request<{ notes: KickoffNote[] }>(
      `/kickoff/${encodeURIComponent(id)}/notes`,
      "POST",
      {
        notes: notes.map(
          ({ meetingId: _meetingId, version, hash, ...note }) => ({
            ...note,
            ...(this.versionedCommands && version && hash
              ? { expectedVersion: version, contentHash: hash }
              : {}),
          }),
        ),
      },
      key,
    );
    return this.versionedCommands ? result.notes : undefined;
  }
  setup(key: string) {
    return this.request<{ id: string }>("/setup", "POST", {}, key);
  }
  async understandSetup(
    id: string,
    answers: Record<string, string>,
    key: string,
  ) {
    return (
      await this.request<{ proposals: SetupProposal[] }>(
        `/setup/${encodeURIComponent(id)}/understand`,
        "POST",
        {
          answers: Object.entries(answers).map(([key, text]) => ({
            key,
            text,
          })),
        },
        key,
      )
    ).proposals;
  }
  async confirmSetup(id: string, proposals: SetupProposal[], key: string) {
    await this.request(
      `/setup/${encodeURIComponent(id)}/confirm`,
      "POST",
      { proposals },
      key,
    );
  }
}
