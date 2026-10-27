import { requestPastDue } from "../shared/request-deadline.ts";
import { randomBytes, randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import type pg from "pg";
import {
  MOBILE_ACCESS_MINUTES,
  MOBILE_REFRESH_DAYS,
  mobileEnrollBody,
  mobilePreferencesBody,
  mobileRefreshBody,
} from "../shared/mobile-contracts.ts";
import type { User } from "../shared/domain.ts";
import { publicUser } from "./auth.ts";
import { audit, fail, getRecord, pool, tokenHash, tx } from "./db.ts";

export type MobileActor = {
  tenant_id: string;
  company_id: string;
  person_id: string;
  device_id: string;
  session_id: string;
  sponsor_user_id: string;
  role: "participant_mobile";
  assurance_level: "invitation_possession";
};
export type MobileRequest = Request & { mobile: MobileActor };

const accessMs = MOBILE_ACCESS_MINUTES * 60 * 1000;
const refreshInterval = `${MOBILE_REFRESH_DAYS} days`;

export function idempotencyKey(req: Request) {
  const key = req.header("Idempotency-Key") || "";
  if (!key || key.length > 128)
    fail(
      400,
      "IDEMPOTENCY_REQUIRED",
      "Send an Idempotency-Key of at most 128 characters.",
    );
  return key;
}

/** Receipts are stored against the person, not the sponsoring advisor. */
export function mobileCommandUser(actor: MobileActor): User {
  return {
    id: actor.person_id,
    name: "Companion participant",
    email: "participant@mobile.invalid",
    role: "participant",
    tenant_id: actor.tenant_id,
    person_id: actor.person_id,
    company_id: actor.company_id,
  };
}

export async function sponsorUser(db: pg.PoolClient, actor: MobileActor) {
  const row = (
    await db.query("SELECT * FROM users WHERE id=$1", [actor.sponsor_user_id])
  ).rows[0];
  if (!row || row.tenant_id !== actor.tenant_id)
    fail(409, "SPONSOR_UNAVAILABLE", "Ask your advisor to reissue this request.");
  return publicUser(row);
}

function issueSecret() {
  return randomBytes(32).toString("hex");
}

async function invitationRow(token: string) {
  const digest = tokenHash(token);
  const first = await pool.query(
    "SELECT tenant_id FROM invitations WHERE token_hash=$1",
    [digest],
  );
  if (!first.rows[0])
    fail(
      410,
      "INVITATION_EXPIRED",
      "This link is unavailable. Ask your advisor for a new link.",
    );
  return { tenantId: first.rows[0].tenant_id as string, digest };
}

function sessionPayload(
  accessToken: string,
  refreshToken: string,
  deviceId: string,
  idempotentReplay: boolean,
) {
  return {
    tokenType: "Bearer" as const,
    accessToken,
    refreshToken,
    accessTokenExpiresAt: new Date(Date.now() + accessMs).toISOString(),
    refreshTokenExpiresAt: new Date(
      Date.now() + MOBILE_REFRESH_DAYS * 86400000,
    ).toISOString(),
    role: "participant_mobile" as const,
    deviceId,
    idempotentReplay,
  };
}

/** Enroll and refresh replays with the same key are honoured this long (TEAM-01-14). */
export const MOBILE_REPLAY_WINDOW = "2 minutes";

const useWebLink = () =>
  fail(
    409,
    "USE_WEB_LINK",
    "This link opens in your web browser, not in the Companion app. Open it from your email in a browser.",
  );

async function rotateSession(db: pg.PoolClient, sessionId: string) {
  const accessToken = issueSecret();
  const refreshToken = issueSecret();
  await db.query(
    `UPDATE participant_sessions
     SET access_token_hash=$2, refresh_token_hash=$3, rotated_at=now(),
         access_expires_at=now()+interval '${MOBILE_ACCESS_MINUTES} minutes'
     WHERE id=$1`,
    [sessionId, tokenHash(accessToken), tokenHash(refreshToken)],
  );
  return { accessToken, refreshToken };
}

export async function enrollParticipant(body: unknown, key = "") {
  // Setup, review and prospect links (uuid.token) belong to the browser (D16, ADV-02-24).
  const raw = (body as any)?.invitationToken;
  if (typeof raw === "string" && /^[0-9a-f-]{36}\.[0-9a-f]{64}$/.test(raw))
    useWebLink();
  const input = mobileEnrollBody.parse(body);
  const replayKey = key && key.length <= 128 ? key : "";
  const { tenantId, digest } = await invitationRow(input.invitationToken);
  return tx(tenantId, async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      "mobile-enroll:" + digest,
    ]);
    const invitation = (
      await db.query(
        "SELECT * FROM invitations WHERE token_hash=$1 FOR UPDATE",
        [digest],
      )
    ).rows[0];
    // A lost enroll response: the same key for the same invitation within the
    // window returns the same session and device with a fresh token pair.
    if (invitation?.used_at && replayKey && !invitation.revoked_at) {
      const session = (
        await db.query(
          `SELECT * FROM participant_sessions
           WHERE tenant_id=$1 AND enrollment_token_hash=$2 AND idempotency_key=$3
             AND revoked_at IS NULL AND issued_at > now() - interval '${MOBILE_REPLAY_WINDOW}'
           ORDER BY issued_at DESC LIMIT 1`,
          [tenantId, digest, replayKey],
        )
      ).rows[0];
      if (session) {
        const tokens = await rotateSession(db, session.id);
        const sponsor = (
          await db.query("SELECT * FROM users WHERE id=$1", [session.sponsor_user_id])
        ).rows[0];
        await audit(db, publicUser(sponsor), session.company_id, "mobile.enroll_replayed", invitation.request_id, {
          personId: session.person_id,
          deviceId: session.device_id,
          sessionId: session.id,
        });
        return sessionPayload(tokens.accessToken, tokens.refreshToken, session.device_id, true);
      }
    }
    if (
      !invitation ||
      invitation.revoked_at ||
      new Date(invitation.expires_at).getTime() <= Date.now() ||
      invitation.used_at
    )
      fail(
        410,
        "INVITATION_EXPIRED",
        "This link is unavailable. Ask your advisor for a new link.",
      );
    const request = await getRecord(
      db,
      invitation.company_id,
      invitation.request_id,
      true,
    );
    if (
      request.kind !== "request" ||
      request.data.personId !== invitation.person_id
    )
      fail(
        403,
        "PERSON_FORBIDDEN",
        "This link does not belong to that participant.",
      );
    const pastDue =
      requestPastDue(request.data.dueDate);
    if (request.state !== "sent" || pastDue)
      fail(410, "REQUEST_CLOSED", "This request is closed.");
    // Checked before the invitation is consumed so the web link keeps working (ONB-01-14).
    const plan = String(request.data.questionPlanVersion || "");
    if (
      !["work", "confirmation"].includes(request.data.type) ||
      plan.startsWith("discovery-contact:") ||
      plan.startsWith("kickoff-exec:")
    )
      useWebLink();
    if (replayKey) {
      const clash = (
        await db.query(
          "SELECT id FROM participant_sessions WHERE tenant_id=$1 AND person_id=$2 AND idempotency_key=$3",
          [tenantId, invitation.person_id, replayKey],
        )
      ).rows[0];
      if (clash)
        fail(
          409,
          "IDEMPOTENCY_CONFLICT",
          "This Idempotency-Key was already used for a different enrollment.",
        );
    }
    const sponsor = (
      await db.query(
        "SELECT u.* FROM record_versions v JOIN users u ON u.id=v.actor_id WHERE v.record_id=$1 AND v.tenant_id=$2 ORDER BY v.version LIMIT 1",
        [request.id, tenantId],
      )
    ).rows[0];
    if (!sponsor)
      fail(409, "SPONSOR_UNAVAILABLE", "Ask your advisor to reissue this request.");
    const deviceId = randomUUID();
    await db.query(
      "INSERT INTO participant_devices(id,tenant_id,company_id,person_id,platform,device_label,app_version) VALUES($1,$2,$3,$4,'unknown',$5,'')",
      [
        deviceId,
        tenantId,
        invitation.company_id,
        invitation.person_id,
        input.deviceLabel || "",
      ],
    );
    const accessToken = issueSecret();
    const refreshToken = issueSecret();
    const sessionId = randomUUID();
    await db.query(
      `INSERT INTO participant_sessions(id,tenant_id,company_id,person_id,device_id,sponsor_user_id,access_token_hash,refresh_token_hash,access_expires_at,expires_at,idempotency_key,enrollment_token_hash)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()+interval '${MOBILE_ACCESS_MINUTES} minutes',now()+interval '${refreshInterval}',$9,$10)`,
      [
        sessionId,
        tenantId,
        invitation.company_id,
        invitation.person_id,
        deviceId,
        sponsor.id,
        tokenHash(accessToken),
        tokenHash(refreshToken),
        replayKey || null,
        digest,
      ],
    );
    await db.query(
      "UPDATE invitations SET used_at=now() WHERE token_hash=$1 AND used_at IS NULL",
      [digest],
    );
    const user = publicUser(sponsor);
    await audit(db, user, invitation.company_id, "mobile.enrolled", request.id, {
      personId: invitation.person_id,
      deviceId,
      sessionId,
      assurance: "invitation_possession",
    });
    return sessionPayload(accessToken, refreshToken, deviceId, false);
  });
}

export async function refreshParticipant(body: unknown, key = "") {
  const input = mobileRefreshBody.parse(body);
  const replayKey = key && key.length <= 128 ? key : "";
  const found = (
    await pool.query(
      "SELECT * FROM mobile_session_by_refresh_hash($1)",
      [tokenHash(input.refreshToken)],
    )
  ).rows[0];
  if (
    !found ||
    found.revoked_at ||
    found.device_revoked_at ||
    new Date(found.expires_at).getTime() <= Date.now()
  )
    fail(401, "SESSION_EXPIRED", "This session has ended. Open your invitation again.");
  return tx(found.tenant_id, async (db) => {
    const current = (
      await db.query(
        "SELECT * FROM participant_sessions WHERE id=$1 FOR UPDATE",
        [found.id],
      )
    ).rows[0];
    const presented = tokenHash(input.refreshToken);
    if (!current || current.revoked_at)
      fail(401, "REFRESH_REPLAY", "This refresh token was already rotated or revoked.");
    let replay = false;
    if (current.refresh_token_hash !== presented) {
      // The previous token inside its grace window, replayed with the same
      // Idempotency-Key as the rotation whose response was lost (TEAM-01-14).
      // Without that key a replayed refresh token stays a 401.
      const inGrace =
        current.previous_refresh_token_hash === presented &&
        current.previous_refresh_valid_until &&
        new Date(current.previous_refresh_valid_until).getTime() > Date.now();
      const sameKey =
        !!replayKey && current.refresh_idempotency_key === replayKey;
      if (!inGrace || !sameKey)
        fail(401, "REFRESH_REPLAY", "This refresh token was already rotated or revoked.");
      replay = true;
    }
    const accessToken = issueSecret();
    const refreshToken = issueSecret();
    await db.query(
      `UPDATE participant_sessions
       SET access_token_hash=$2, refresh_token_hash=$3, rotated_at=now(),
           access_expires_at=now()+interval '${MOBILE_ACCESS_MINUTES} minutes',
           expires_at=now()+interval '${refreshInterval}',
           previous_refresh_token_hash=$4,
           previous_refresh_valid_until=$5,
           refresh_idempotency_key=$6
       WHERE id=$1`,
      [
        current.id,
        tokenHash(accessToken),
        tokenHash(refreshToken),
        presented,
        replay
          ? current.previous_refresh_valid_until
          : replayKey
            ? new Date(Date.now() + 2 * 60 * 1000)
            : null,
        replay ? current.refresh_idempotency_key : replayKey || null,
      ],
    );
    await db.query(
      "UPDATE participant_devices SET last_seen_at=now() WHERE id=$1",
      [current.device_id],
    );
    const sponsor = (
      await db.query("SELECT * FROM users WHERE id=$1", [current.sponsor_user_id])
    ).rows[0];
    await audit(
      db,
      publicUser(sponsor),
      current.company_id,
      "mobile.session_refreshed",
      null,
      { personId: current.person_id, deviceId: current.device_id, sessionId: current.id },
    );
    return sessionPayload(accessToken, refreshToken, current.device_id, replay);
  });
}

export async function authenticateMobile(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  try {
    const header = req.header("Authorization") || "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!/^[a-f0-9]{64}$/.test(token))
      fail(401, "SESSION_EXPIRED", "Sign in with your Companion session.");
    const found = (
      await pool.query("SELECT * FROM mobile_session_by_access_hash($1)", [
        tokenHash(token),
      ])
    ).rows[0];
    if (
      !found ||
      found.revoked_at ||
      found.device_revoked_at ||
      new Date(found.access_expires_at).getTime() <= Date.now() ||
      new Date(found.expires_at).getTime() <= Date.now()
    )
      fail(401, "SESSION_EXPIRED", "Your Companion session has expired.");
    (req as MobileRequest).mobile = {
      tenant_id: found.tenant_id,
      company_id: found.company_id,
      person_id: found.person_id,
      device_id: found.device_id,
      session_id: found.id,
      sponsor_user_id: found.sponsor_user_id,
      role: "participant_mobile",
      assurance_level: "invitation_possession",
    };
    await tx(found.tenant_id, (db) =>
      db.query("UPDATE participant_devices SET last_seen_at=now() WHERE id=$1", [
        found.device_id,
      ]),
    );
    next();
  } catch (error) {
    next(error);
  }
}

export async function sessionAlreadyRevoked(req: Request) {
  const header = req.header("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!/^[a-f0-9]{64}$/.test(token)) return false;
  const found = (
    await pool.query("SELECT * FROM mobile_session_by_access_hash($1)", [
      tokenHash(token),
    ])
  ).rows[0];
  return !!found?.revoked_at;
}

export async function logoutParticipant(actor: MobileActor) {
  return tx(actor.tenant_id, async (db) => {
    await db.query(
      "UPDATE participant_sessions SET revoked_at=now() WHERE id=$1 AND revoked_at IS NULL",
      [actor.session_id],
    );
    await db.query(
      "UPDATE participant_devices SET revoked_at=now() WHERE id=$1 AND revoked_at IS NULL",
      [actor.device_id],
    );
    await db.query(
      "UPDATE push_subscriptions SET enabled=false, invalidated_at=now() WHERE device_id=$1 AND invalidated_at IS NULL",
      [actor.device_id],
    );
    const sponsor = await sponsorUser(db, actor);
    await audit(db, sponsor, actor.company_id, "mobile.session_revoked", null, {
      personId: actor.person_id,
      deviceId: actor.device_id,
      sessionId: actor.session_id,
    });
    return { ok: true };
  });
}

export async function readMobileProfile(actor: MobileActor) {
  return tx(actor.tenant_id, async (db) => {
    const person = await getRecord(db, actor.company_id, actor.person_id);
    if (person.kind !== "person")
      fail(404, "NOT_FOUND", "Participant profile not found.");
    const company = (
      await db.query("SELECT id, name FROM companies WHERE id=$1", [
        actor.company_id,
      ])
    ).rows[0];
    const email = String(person.data.email || "");
    if (!email.includes("@"))
      fail(403, "PERSON_FORBIDDEN", "This participant profile is incomplete.");
    return {
      personId: person.id,
      companyId: company.id,
      name: person.title,
      email,
      roleTitle: person.data.role || "",
      team: person.data.team || "",
      companyName: company.name,
    };
  });
}

export async function updateMobilePreferences(actor: MobileActor, body: unknown) {
  const input = mobilePreferencesBody.parse(body);
  return tx(actor.tenant_id, async (db) => {
    const device = (
      await db.query(
        "SELECT preferences FROM participant_devices WHERE id=$1 AND person_id=$2 FOR UPDATE",
        [actor.device_id, actor.person_id],
      )
    ).rows[0];
    if (!device) fail(404, "NOT_FOUND", "Device not found.");
    const preferences = { ...(device.preferences || {}), ...input };
    await db.query(
      "UPDATE participant_devices SET preferences=$2 WHERE id=$1",
      [actor.device_id, preferences],
    );
    const sponsor = await sponsorUser(db, actor);
    await audit(db, sponsor, actor.company_id, "mobile.preferences_updated", null, {
      personId: actor.person_id,
      deviceId: actor.device_id,
      keys: Object.keys(input),
    });
    return { preferences };
  });
}

export function mobileActor(req: Request) {
  return (req as MobileRequest).mobile;
}
