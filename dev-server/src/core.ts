import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  existsSync,
} from "node:fs";
import { dirname } from "node:path";
import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
export const uuid = randomUUID;
export const digest = (v: string | Uint8Array) =>
  createHash("sha256").update(v).digest("hex");
export function canonical(v: unknown): string {
  if (v === undefined) return "null";
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  return (
    "{" +
    Object.entries(v as Record<string, unknown>)
      .filter(([, x]) => x !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, x]) => JSON.stringify(k) + ":" + canonical(x))
      .join(",") +
    "}"
  );
}
export const hash = (v: unknown) => digest(canonical(v));
export function version<T extends object>(
  v: T,
  n = 1,
): T & { version: number; hash: string } {
  const x = { ...v, version: n };
  delete (x as Record<string, unknown>).hash;
  return { ...x, hash: hash(x) };
}
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryable = false,
  ) {
    super(message);
  }
}
export function fail(status: number, code: string, message: string): never {
  throw new ApiError(status, code, message);
}
export function errors(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  const x =
    err instanceof ApiError
      ? err
      : err instanceof ZodError || err instanceof SyntaxError
        ? new ApiError(400, "VALIDATION_ERROR", "Check the request fields.")
        : new ApiError(
            500,
            "INTERNAL_ERROR",
            "The request could not be completed.",
            true,
          );
  res.status(x.status).json({
    code: x.code,
    message: x.message,
    retryable: x.retryable,
    requestId: res.locals.requestId,
  });
}
export type Principal = {
  sessionId: string;
  companyId: string;
  personId: string;
  role: "participant_mobile" | "advisor_mobile";
};
export type StoredSession = Principal & {
  deviceId: string;
  accessHash: string;
  refreshHash: string;
  accessExpiresAt: number;
  expiresAt: number;
  revoked: boolean;
  usedRefresh: string[];
  replays: Record<string, { bodyHash: string; at: number }>;
};
export interface Stored<T = unknown> {
  companyId: string;
  personId?: string;
  value: T;
}
export class Store {
  records: Record<string, Record<string, Stored>> = {};
  sessions: Record<string, StoredSession> = {};
  invitations: Record<
    string,
    {
      companyId: string;
      personId: string;
      expiresAt: number;
      used?: boolean;
      sessionId?: string;
      key?: string;
      bodyHash?: string;
      consumedAt?: number;
    }
  > = {};
  pairing: Record<
    string,
    {
      companyId: string;
      personId: string;
      expiresAt: number;
      used?: boolean;
      sessionId?: string;
      key?: string;
      bodyHash?: string;
      consumedAt?: number;
    }
  > = {};
  constructor(public file?: string) {
    if (file && existsSync(file)) {
      const d = JSON.parse(readFileSync(file, "utf8"));
      this.records = d.records ?? {};
      this.sessions = d.sessions ?? {};
      this.invitations = d.invitations ?? {};
      this.pairing = d.pairing ?? {};
    }
  }
  save() {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = this.file + ".tmp";
    writeFileSync(
      tmp,
      JSON.stringify({
        records: this.records,
        sessions: this.sessions,
        invitations: this.invitations,
        pairing: this.pairing,
      }),
      { mode: 0o600 },
    );
    renameSync(tmp, this.file);
  }
  put<T>(
    kind: string,
    id: string,
    value: T,
    companyId: string,
    personId?: string,
  ): T {
    (this.records[kind] ??= {})[id] = { companyId, personId, value };
    this.save();
    return value;
  }
  get<T>(kind: string, id: string, p: Principal, person = false): T {
    const r = this.records[kind]?.[id];
    if (!r) fail(404, "NOT_FOUND", "This item was not found.");
    if (r.companyId !== p.companyId || (person && r.personId !== p.personId))
      fail(
        403,
        "PERSON_FORBIDDEN",
        "This item is not available to this session.",
      );
    return structuredClone(r.value) as T;
  }
  list<T>(kind: string, p: Principal, person = false): T[] {
    return Object.values(this.records[kind] ?? {})
      .filter(
        (r) =>
          r.companyId === p.companyId && (!person || r.personId === p.personId),
      )
      .map((r) => structuredClone(r.value) as T);
  }
}
export function principal(res: Response): Principal {
  return res.locals.principal as Principal;
}
export function authenticate(store: Store, roles: Principal["role"][]) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = req.headers.authorization?.match(
        /^Bearer ([A-Za-z0-9_-]{32,512})$/,
      )?.[1];
      const s = token
        ? Object.values(store.sessions).find(
            (s) => s.accessHash === digest(token),
          )
        : undefined;
      if (
        !s ||
        s.revoked ||
        s.accessExpiresAt <= Date.now() ||
        s.expiresAt <= Date.now()
      )
        fail(401, "SESSION_EXPIRED", "Pair or enroll again.");
      if (!roles.includes(s.role))
        fail(403, "PERSON_FORBIDDEN", "This role cannot use this operation.");
      res.locals.principal = s;
      next();
    } catch (e) {
      next(e);
    }
  };
}
export function issue(
  store: Store,
  subject: { companyId: string; personId: string },
  role: Principal["role"],
  existing?: StoredSession,
  replay = false,
) {
  const now = Date.now(),
    accessToken = randomBytes(32).toString("base64url"),
    refreshToken = randomBytes(48).toString("base64url");
  const s: StoredSession = existing ?? {
    ...subject,
    role,
    sessionId: uuid(),
    deviceId: uuid(),
    accessHash: "",
    refreshHash: "",
    accessExpiresAt: 0,
    expiresAt: now + 30 * 86400000,
    revoked: false,
    usedRefresh: [],
    replays: {},
  };
  if (s.refreshHash) s.usedRefresh.push(s.refreshHash);
  s.accessHash = digest(accessToken);
  s.refreshHash = digest(refreshToken);
  s.accessExpiresAt = now + 15 * 60000;
  store.sessions[s.sessionId] = s;
  store.save();
  const common = {
    tokenType: "Bearer" as const,
    accessToken,
    refreshToken,
    deviceId: s.deviceId,
    role,
    idempotentReplay: replay,
  };
  return role === "participant_mobile"
    ? {
        ...common,
        accessTokenExpiresAt: new Date(s.accessExpiresAt).toISOString(),
        refreshTokenExpiresAt: new Date(s.expiresAt).toISOString(),
      }
    : {
        ...common,
        accessExpiresAt: new Date(s.accessExpiresAt).toISOString(),
        expiresAt: new Date(s.expiresAt).toISOString(),
        advisor: { id: s.personId, name: "Alex Moreno" },
        company: {
          id: s.companyId,
          name: s.companyId === IDS.company ? "Larkspur Supply" : "Cobalt",
        },
      };
}
export function requireKey(req: Request) {
  const k = req.header("Idempotency-Key");
  if (!k) fail(400, "IDEMPOTENCY_REQUIRED", "An idempotency key is required.");
  if (k.length > 200)
    fail(400, "VALIDATION_ERROR", "The idempotency key is too long.");
  return k;
}
export function checkVersion(
  record: { version: number; hash?: string; contentHash?: string },
  v: number,
  h?: string,
) {
  if (record.version !== v)
    fail(409, "VERSION_CONFLICT", "This item has changed. Load it again.");
  if (h && h !== (record.hash ?? record.contentHash))
    fail(409, "HASH_CONFLICT", "This item has changed. Load it again.");
}
export const IDS = {
  company: "10000000-0000-4000-8000-000000000001",
  otherCompany: "10000000-0000-4000-8000-000000000002",
  participant: "20000000-0000-4000-8000-000000000001",
  advisor: "20000000-0000-4000-8000-000000000002",
  priya: "20000000-0000-4000-8000-000000000003",
  marcus: "20000000-0000-4000-8000-000000000004",
  request: "30000000-0000-4000-8000-000000000001",
  confirmation: "30000000-0000-4000-8000-000000000002",
  task: "40000000-0000-4000-8000-000000000001",
};
