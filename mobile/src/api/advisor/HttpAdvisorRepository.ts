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
} from "@/storage/advisor";
import {
  CompanionApiError,
  errorFromResponse,
  networkOffline,
  notAvailable,
} from "@/api/http/errors";
import { newIdempotencyKey } from "@/utils/id";
import * as Crypto from "expo-crypto";
import { useAdvisorStore } from "@/state/advisor";

export class HttpAdvisorRepository implements AdvisorRepository {
  readonly kind = "http" as const;
  private refreshing: Promise<AdvisorSession> | null = null;
  private refreshKey: { token: string; key: string } | null = null;
  constructor(private origin: string | undefined) {}
  private async request<T>(
    path: string,
    method = "GET",
    body?: unknown,
    key?: string,
    authorized = true,
    retry = true,
    namespace = "/api/mobile/meetings/v1",
  ): Promise<T> {
    if (!this.origin) return notAvailable();
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
    const abort = new AbortController(),
      timer = setTimeout(() => abort.abort(), 20000);
    let response: Response;
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
      throw networkOffline();
    } finally {
      clearTimeout(timer);
    }
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
      );
    }
    if (response.status === 404 || response.status === 501)
      return notAvailable();
    if (!response.ok) {
      const error = errorFromResponse(response.status, await response.text());
      if (
        error.code === "REFRESH_REPLAY" ||
        (response.status === 401 &&
          (authorized || path === "/advisor/session/refresh"))
      )
        await useAdvisorStore.getState().clear();
      throw error;
    }
    if (response.status === 204) return undefined as T;
    const raw = await response.text();
    return raw ? (JSON.parse(raw) as T) : (undefined as T);
  }
  private refresh(): Promise<AdvisorSession> {
    if (!this.refreshing)
      this.refreshing = (async () => {
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
          const next = await this.request<AdvisorSession>(
            "/advisor/session/refresh",
            "POST",
            { refreshToken: s.refreshToken },
            this.refreshKey.key,
            false,
            false,
          );
          await advisorTokens.set(next);
          this.refreshKey = null;
          await saveAdvisorDraft("refresh-key", null);
          return next;
        } catch (e) {
          if (
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
    return this.request<AdvisorSession>(
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
      lines: { id: string; url: string; hash: string; durationMs: number }[];
    }>("/voice/lines", "POST", input, key, true, true, "/api/mobile/v1x");
  }
  async logout(key: string) {
    await this.request("/advisor/session/logout", "POST", {}, key);
  }
  async people() {
    return (await this.request<{ people: Person[] }>("/people")).people;
  }
  async meetings() {
    return (await this.request<{ meetings: MeetingDefinition[] }>("/meetings"))
      .meetings;
  }
  meeting(id: string) {
    return this.request<MeetingDefinition>(
      `/meetings/${encodeURIComponent(id)}`,
    );
  }
  create(input: CreateMeeting, key: string) {
    return this.request<MeetingDefinition>("/meetings", "POST", input, key);
  }
  patch(
    id: string,
    input: Partial<CreateMeeting> & { expectedVersion: number },
    key: string,
  ) {
    return this.request<MeetingDefinition>(
      `/meetings/${encodeURIComponent(id)}`,
      "PATCH",
      input,
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
  route(id: string, choice: "pulse" | "shorter" | "as_planned", key: string) {
    return this.request<MeetingDefinition>(
      `/meetings/${encodeURIComponent(id)}/route`,
      "POST",
      { choice },
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
    return this.request<SessionDetail>(`/sessions/${encodeURIComponent(id)}`);
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
  async finish(id: string, key: string) {
    await this.request(
      `/sessions/${encodeURIComponent(id)}/finish`,
      "POST",
      {},
      key,
    );
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
    await this.request(
      `/sessions/${encodeURIComponent(sessionId)}/closing`,
      "POST",
      { items: [item] },
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
    await this.request(
      `/kickoff/${encodeURIComponent(id)}/notes`,
      "POST",
      { notes: notes.map(({ meetingId: _meetingId, ...note }) => note) },
      key,
    );
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
