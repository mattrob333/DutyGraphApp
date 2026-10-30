import { config } from "../config";
import {
  tokenStore as defaultTokenStore,
  type StoredSession,
} from "@/storage/tokens";
import { newIdempotencyKey } from "@/utils/id";
import type { components } from "../generated/companion-mobile-v1";
import {
  errorFromResponse,
  networkOffline,
  requestTimeout,
  sessionEnded,
} from "./errors";
import { CompanionApiError } from "@/types/domain";

type ParticipantMobileSession =
  components["schemas"]["ParticipantMobileSession"];

type FetchLike = (input: string, init?: any) => Promise<Response>;

export interface ApiClientOptions {
  baseUrl?: string;
  fetch?: FetchLike;
  tokenStore?: Pick<typeof defaultTokenStore, "get" | "set" | "clear">;
  now?: () => number;
  newKey?: () => string;
  /** Default request timeout. */
  timeoutMs?: number;
  /** Refresh when the access token has less than this left. */
  refreshSkewMs?: number;
}

export interface RequestOptions {
  /** Explicit trusted origin for proposed APIs; authentication refresh stays on v1. */
  apiBaseUrl?: string;
  body?: unknown;
  formData?: FormData;
  idempotencyKey?: string;
  timeoutMs?: number;
  /** Public calls (enroll, refresh) send no bearer token and never refresh. */
  auth?: boolean;
  /** Set false for logout so an ended session does not trigger a refresh. */
  retryOn401?: boolean;
  headers?: Record<string, string>;
}

export const DEFAULT_TIMEOUT_MS = 30_000;
export const TRANSCRIBE_TIMEOUT_MS = 120_000;

export function toStoredSession(
  s: ParticipantMobileSession,
  localSessionId = newIdempotencyKey(),
): StoredSession {
  return {
    localSessionId,
    accessToken: s.accessToken,
    refreshToken: s.refreshToken,
    accessExpiresAt: s.accessTokenExpiresAt,
    refreshExpiresAt: s.refreshTokenExpiresAt,
    deviceId: s.deviceId,
  };
}

/**
 * Thin fetch wrapper for `/api/mobile/v1`. Owns bearer auth and the
 * refresh-token rotation rules from docs/companion-mobile-api.md. It never
 * logs tokens, request bodies or response bodies.
 */
let participantGeneration = 0;
export function invalidateParticipantRequests() {
  participantGeneration++;
}
export const getParticipantSessionGeneration = () => participantGeneration;
export const assertParticipantGeneration = (owner: number) => {
  if (owner !== participantGeneration) throw sessionEnded();
};

export class ApiClient {
  private readonly baseUrl: string;
  private readonly doFetch: FetchLike;
  private readonly tokens: NonNullable<ApiClientOptions["tokenStore"]>;
  private readonly now: () => number;
  private readonly newKey: () => string;
  private readonly timeoutMs: number;
  private readonly skewMs: number;
  private refreshing: Promise<StoredSession> | null = null;
  /** Idempotency-Key reused for retries of the refresh of one specific refresh token. */
  private refreshKey: { token: string; key: string } | null = null;

  constructor(opts: ApiClientOptions = {}) {
    this.baseUrl =
      opts.baseUrl ?? `${config.apiBaseUrl}${config.mobileApiPath}`;
    this.doFetch = opts.fetch ?? ((input, init) => fetch(input, init));
    this.tokens = opts.tokenStore ?? defaultTokenStore;
    this.now = opts.now ?? Date.now;
    this.newKey = opts.newKey ?? newIdempotencyKey;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.skewMs = opts.refreshSkewMs ?? 60_000;
  }

  /** Public endpoint metadata for extensions; carries no session credential. */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  async request<T>(
    method: string,
    path: string,
    opts: RequestOptions = {},
  ): Promise<T> {
    const auth = opts.auth !== false;
    const owner = participantGeneration;
    let token: string | undefined;
    if (auth) {
      let session = await this.tokens.get();
      assertParticipantGeneration(owner);
      if (!session) throw sessionEnded();
      if (this.isNearExpiry(session)) session = await this.refresh();
      assertParticipantGeneration(owner);
      token = session.accessToken;
    }
    let res = await this.send(method, path, opts, token);
    if (auth) assertParticipantGeneration(owner);
    if (res.status === 401 && auth && opts.retryOn401 !== false) {
      const current = await this.tokens.get();
      assertParticipantGeneration(owner);
      // Another request may already have rotated the token while ours was in flight.
      const fresh =
        current && current.accessToken !== token
          ? current
          : await this.refresh();
      assertParticipantGeneration(owner);
      res = await this.send(method, path, opts, fresh.accessToken);
      assertParticipantGeneration(owner);
    }
    const result = await this.parse<T>(res);
    if (auth) assertParticipantGeneration(owner);
    return result;
  }

  get<T>(path: string, opts: RequestOptions = {}) {
    return this.request<T>("GET", path, opts);
  }

  post<T>(path: string, body?: unknown, opts: RequestOptions = {}) {
    return this.request<T>("POST", path, { ...opts, body });
  }

  clearSession() {
    participantGeneration++;
    this.refreshing = null;
    this.refreshKey = null;
    return this.tokens.clear();
  }

  /** Persist a freshly issued session (enroll). */
  saveSession(s: ParticipantMobileSession) {
    participantGeneration++;
    this.refreshing = null;
    this.refreshKey = null;
    return this.tokens.set(toStoredSession(s, this.newKey()));
  }

  /** Clear local credentials first; a delayed logout can only revoke its captured bearer. */
  async revokeSession(): Promise<void> {
    const owner = participantGeneration;
    const session = await this.tokens.get();
    assertParticipantGeneration(owner);
    await this.clearSession();
    if (session)
      await this.request("POST", "/session/logout", {
        auth: false,
        retryOn401: false,
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });
  }

  private isNearExpiry(s: StoredSession): boolean {
    const exp = Date.parse(s.accessExpiresAt);
    return Number.isFinite(exp) && exp - this.now() < this.skewMs;
  }

  /** Single-flight: concurrent callers share one rotation. */
  refresh(): Promise<StoredSession> {
    if (!this.refreshing) {
      const running = this.doRefresh().finally(() => {
        if (this.refreshing === running) this.refreshing = null;
      });
      this.refreshing = running;
    }
    return this.refreshing;
  }

  private async doRefresh(): Promise<StoredSession> {
    const owner = participantGeneration;
    const session = await this.tokens.get();
    assertParticipantGeneration(owner);
    if (!session) throw sessionEnded();
    if (!this.refreshKey || this.refreshKey.token !== session.refreshToken) {
      this.refreshKey = { token: session.refreshToken, key: this.newKey() };
    }
    const res = await this.send(
      "POST",
      "/session/refresh",
      {
        body: { refreshToken: session.refreshToken },
        idempotencyKey: this.refreshKey.key,
        auth: false,
      },
      undefined,
    );
    assertParticipantGeneration(owner);
    if (
      res.status === 401 ||
      res.status === 403 ||
      res.status === 409 ||
      res.status === 422
    ) {
      // REFRESH_REPLAY, SESSION_EXPIRED, revoked device: the session is over.
      await this.tokens.clear();
      this.refreshKey = null;
      throw sessionEnded();
    }
    const body = await this.parse<ParticipantMobileSession>(res);
    const latest = await this.tokens.get();
    assertParticipantGeneration(owner);
    if (!latest || latest.refreshToken !== session.refreshToken)
      throw sessionEnded();
    const stored = toStoredSession(
      body,
      latest.localSessionId ?? session.localSessionId ?? this.newKey(),
    );
    assertParticipantGeneration(owner);
    await this.tokens.set(stored);
    this.refreshKey = null;
    return stored;
  }

  private async send(
    method: string,
    path: string,
    opts: RequestOptions,
    token: string | undefined,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...(opts.headers ?? {}),
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;
    let body: any;
    if (opts.formData) {
      body = opts.formData; // fetch sets the multipart boundary itself
    } else if (opts.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(opts.body);
    }
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      opts.timeoutMs ?? this.timeoutMs,
    );
    try {
      return await this.doFetch(`${opts.apiBaseUrl ?? this.baseUrl}${path}`, {
        method,
        headers,
        body,
        signal: controller.signal,
      });
    } catch (e) {
      if (controller.signal.aborted) throw requestTimeout();
      if (e instanceof CompanionApiError) throw e;
      throw networkOffline();
    } finally {
      clearTimeout(timer);
    }
  }

  private async parse<T>(res: Response): Promise<T> {
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    if (!res.ok)
      throw errorFromResponse(
        res.status,
        text,
        res.headers?.get?.("x-request-id"),
      );
    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new CompanionApiError(
        "BAD_RESPONSE",
        "DutyGraph sent an unexpected reply. Please try again.",
        res.status,
        true,
      );
    }
  }
}
