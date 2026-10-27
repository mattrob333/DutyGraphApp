import { sourcesForAnswers } from "../shared/answer-sources.ts";
import { requestPastDue } from "../shared/request-deadline.ts";
import express, { Router } from "express";
import { createHash, randomUUID } from "node:crypto";
import { waitUntil } from "@vercel/functions";
import { z } from "zod";
import { schemas } from "../shared/domain.ts";
import {
  answerCoverageBody,
  COMPANION_UNDERSTANDING_SCHEMA,
  NOT_STATED,
  participantCardFields,
  mobileAttestBody,
  mobileSubmitBody,
  mobileTranscriptionAssetBody,
  mobileUnderstandingBody,
  mobileUpdateBody,
  understandingModelOutput,
  XAI_GENERATION_MODEL,
  XAI_GENERATION_REASONING,
  XAI_STT_MODEL,
  XAI_STT_SCHEMA,
} from "../shared/mobile-contracts.ts";
import {
  AppError,
  audit,
  command,
  fail,
  getRecord,
  hash,
  putRecord,
  setState,
  tx,
} from "./db.ts";
import {
  enqueueGapReply,
  processGapReply,
  type GapReplyProvider,
} from "./gap-replies.ts";
import {
  authenticateMobile,
  enrollParticipant,
  idempotencyKey,
  logoutParticipant,
  mobileActor,
  mobileCommandUser,
  readMobileProfile,
  refreshParticipant,
  sessionAlreadyRevoked,
  sponsorUser,
  updateMobilePreferences,
  type MobileActor,
} from "./mobile-auth.ts";
import { registerPushToken } from "./mobile-notifications.ts";
import { recordParticipantAnswer } from "./participant-answers.ts";
import { queueParticipantReceipt } from "./advisor-notifications.ts";
import { requestAdvisorName } from "./invitations.ts";
import type { CopilotModelProvider } from "./copilot/model.ts";
import { understandRequestSchema } from "../shared/participant-understand.ts";
import { runUnderstand, understandGate } from "./participant-understand.ts";
import { coverageGate, requestQuestions, runCoverage } from "./participant-coverage.ts";
import { queueFillExtraction } from "./fill/hooks.ts";
import { parseCompanionAudioUpload } from "./companion-upload.ts";
import { understandWithXai, type UnderstandingContext } from "./xai-generation.ts";
import {
  requestKeyterms,
  transcribeWithXai,
  xaiApiKey,
  type XaiTranscriptionInput,
  type XaiTranscriptionResult,
} from "./xai-transcription.ts";

type UnderstandingResult = {
  output: z.infer<typeof understandingModelOutput>;
  requestId: string;
  model: string;
  schemaVersion: string;
};

export type MobileApiOptions = {
  transcription?: (
    input: XaiTranscriptionInput,
  ) => Promise<XaiTranscriptionResult>;
  understanding?: (input: UnderstandingContext) => Promise<UnderstandingResult>;
  gapReplyProvider?: GapReplyProvider;
  transcriptionPerRequest?: number;
  /** Daily floor per company; the cap grows with the roster (TEAM-01-30). */
  transcriptionPerTenant?: number;
  understandingPerTenant?: number;
  /** Attempts per person on the roster per day, added to the floor. */
  perPersonDaily?: number;
  /** Push delivery for reminders and new requests. Defaults to Expo when enabled. */
  pushProvider?: import("./mobile-notifications.ts").PushProvider;
  /**
   * v1.2: tests inject a fake model for "Here's what we heard" and the coverage check;
   * otherwise the company's approved AI connection, as on the web team page.
   */
  answerModel?: CopilotModelProvider;
};

const blank = "Not yet recorded";
const known = (value: string | undefined) => {
  const text = (value || "").trim();
  return text || blank;
};

const AUDIO_LIMIT = 25 * 1024 * 1024;

async function assignedRequest(
  db: any,
  actor: MobileActor,
  requestId: string,
  lock = false,
) {
  let request: any;
  try {
    request = await getRecord(db, actor.company_id, requestId, lock);
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND")
      fail(404, "REQUEST_NOT_FOUND", "That request is not in this workspace.");
    throw error;
  }
  if (request.kind !== "request")
    fail(404, "REQUEST_NOT_FOUND", "That request is not in this workspace.");
  if (request.data.personId !== actor.person_id)
    fail(403, "PERSON_FORBIDDEN", "This request belongs to someone else.");
  return request;
}

function pastDue(request: any) {
  return requestPastDue(request.data.dueDate);
}

function assertOpen(request: any, expectedVersion: number, contentHash: string) {
  if (request.version !== expectedVersion)
    fail(
      409,
      "VERSION_CONFLICT",
      "The request changed. Reload before continuing.",
    );
  if (request.hash !== contentHash)
    fail(
      409,
      "HASH_CONFLICT",
      "The request or understanding hash does not match the saved record.",
    );
  if (request.state !== "sent" || pastDue(request))
    fail(410, "REQUEST_CLOSED", "This request is closed.");
  if (request.data.type !== "work")
    fail(
      422,
      "WORK_ONLY",
      "Use task-card attestation for a confirmation request.",
    );
}

/**
 * The app answers work questions and task checks. Leadership, kickoff and
 * first-touch requests stay on their web links (ONB-01-14, KICK-01-10).
 */
export function companionAnswerable(request: any) {
  const plan = String(request.data?.questionPlanVersion || "");
  return (
    ["work", "confirmation"].includes(request.data?.type) &&
    !webOnlyPlans.some((prefix) => plan.startsWith(prefix))
  );
}
/** First-touch and executive pre-work plans stay on their web links whatever their type. */
export const webOnlyPlans = ["discovery-contact:", "kickoff-exec:"];

/** v1.2 hands-free routes (coverage, understand): an open work request, no version check. */
function assertAnswerable(request: any) {
  if (request.state !== "sent" || pastDue(request))
    fail(410, "REQUEST_CLOSED", "This request is closed.");
  if (request.data.type !== "work")
    fail(422, "WORK_ONLY", "Only work questions have question cards.");
}

function needsYou(request: any) {
  return request.state === "sent" && !pastDue(request);
}

/** v1.2: each question also carries its web key, short title and hints (no "Anything else?" card). */
function questionList(request: any, advisorName = "") {
  const cards = requestQuestions(request, advisorName);
  return (request.data.questions || []).map((text: string, index: number) => ({
    questionId: `q${index + 1}`,
    text: String(text),
    key: cards[index].key,
    short: cards[index].short,
    hints: cards[index].hints,
  }));
}

function requestSummary(request: any) {
  return {
    requestId: request.id,
    version: request.version,
    contentHash: request.hash,
    title: request.title,
    type: request.data.type,
    state: request.state,
    dueDate: request.data.dueDate,
    questionCount: (request.data.questions || []).length,
    needsYou: needsYou(request),
    ...(request.data.type === "confirmation"
      ? { taskCardIds: [...(request.data.taskIds || [])] }
      : {}),
    ...(request.data.notice
      ? { noticePreview: String(request.data.notice).slice(0, 500) }
      : {}),
  };
}

function jobState(state: string) {
  if (state === "succeeded") return "complete";
  if (state === "running" || state === "failed") return state;
  return "unknown";
}

function confirmationDecision(decision: string) {
  return decision === "correction" ? "needs_change" : decision;
}

/**
 * Companion routes under /api/mobile/v1.
 * React Native types come from contracts/companion-mobile.openapi.json.
 * Pinned operationIds: enrollParticipant, refreshParticipantSession,
 * logoutParticipantSession, getParticipantProfile, listParticipantRequests,
 * getParticipantRequest, createTranscription, createUnderstanding,
 * submitParticipantRequest, the task-card operations (v1.1), and
 * checkAnswerCoverage and understandParticipantAnswers (v1.2). Preferences,
 * push tokens, stream tickets, and /updates stay implemented here but are not
 * in that pin.
 */

function draftUnderstanding(
  sourceText: string,
  output: z.infer<typeof understandingModelOutput>,
) {
  const tasks: Record<string, unknown>[] = [];
  const gaps = output.gaps
    .map((gap) => gap.trim().slice(0, 200))
    .filter((gap) => gap.length > 0)
    .slice(0, 12);
  // Incomplete steps are kept with "Not stated" and named gaps (TEAM-01-15).
  output.cards.forEach((card, index) => {
    if (tasks.length >= 30) return;
    const values: Record<string, string> = {
      title: card.title.trim(),
      duty: card.duty.trim(),
      inputs: card.inputs.trim(),
      instructions: card.instructions.trim(),
      output: card.output.trim(),
      handoff: card.handoff.trim(),
      software: card.software.trim(),
    };
    const missingFields = participantCardFields.filter((field) => !values[field]);
    const title = values.title || `Step ${index + 1} (title not stated)`;
    const task = {
      title: title.slice(0, 200),
      duty: values.duty || NOT_STATED,
      inputs: card.inputs.trim() ? card.inputs : NOT_STATED,
      instructions: card.instructions.trim() ? card.instructions : NOT_STATED,
      output: card.output.trim() ? card.output : NOT_STATED,
      handoff: card.handoff.trim() ? card.handoff : NOT_STATED,
      software: card.software.trim() ? card.software : NOT_STATED,
      ...(card.purpose.trim() ? { purpose: card.purpose } : {}),
      ...(card.trigger.trim() ? { trigger: card.trigger } : {}),
      ...(card.humanGate.trim() ? { humanGate: card.humanGate } : {}),
      ...(missingFields.length ? { missingFields } : {}),
    };
    if (missingFields.length && gaps.length < 12)
      gaps.push(
        `'${title.slice(0, 80)}': ${missingFields.join(", ")} not stated`.slice(0, 200),
      );
    tasks.push(task);
  });
  const summary = String(tasks[0]?.title || sourceText).slice(0, 3000);
  const contentHash = hash({ summary, tasks, gaps });
  return { summary, tasks, gaps, contentHash };
}

function understandingBody(row: any, replay: boolean) {
  const result = row.result || {};
  const input = row.input || {};
  return {
    confirmationState: "proposed" as const,
    summary: String(result.summary || ""),
    tasks: result.tasks || [],
    gaps: result.gaps || [],
    contentHash: result.contentHash,
    idempotentReplay: replay,
    job: {
      jobId: row.id,
      kind: "proposed_understanding" as const,
      state: jobState(row.state),
      provider: "xai" as const,
      model: XAI_GENERATION_MODEL,
      schemaVersion: COMPANION_UNDERSTANDING_SCHEMA,
      promptVersion: COMPANION_UNDERSTANDING_SCHEMA,
      requestHash: result.requestHash || input.requestHash,
      ...(result.contentHash ? { responseHash: result.contentHash } : {}),
      ...(result.providerRequestId
        ? { providerRequestId: result.providerRequestId }
        : {}),
      store: false as const,
      createdAt: new Date(row.created_at).toISOString(),
      finishedAt: row.finished_at ? new Date(row.finished_at).toISOString() : null,
    },
  };
}

function transcriptionBody(row: any, replay: boolean) {
  const state = jobState(row.state);
  const result = row.result || {};
  const input = row.input || {};
  return {
    ...(state === "complete" && result.text ? { text: result.text } : {}),
    reviewRequired: true as const,
    idempotentReplay: replay,
    ...(input.assetId ? { assetId: input.assetId } : {}),
    ...(input.audioHash ? { audioChecksum: input.audioHash } : {}),
    job: {
      jobId: row.id,
      kind: "audio_transcription" as const,
      state,
      provider: "xai" as const,
      model: result.model || input.model || XAI_STT_MODEL,
      schemaVersion: XAI_STT_SCHEMA,
      promptVersion: XAI_STT_SCHEMA,
      requestHash: input.requestHash,
      ...(result.transcriptHash ? { responseHash: result.transcriptHash } : {}),
      ...(result.providerRequestId
        ? { providerRequestId: result.providerRequestId }
        : {}),
      store: false,
      ...(row.message ? { message: String(row.message).slice(0, 500) } : {}),
      createdAt: new Date(row.created_at).toISOString(),
      finishedAt: row.finished_at ? new Date(row.finished_at).toISOString() : null,
    },
  };
}

export function mobileRouter(options: MobileApiOptions = {}) {
  const router = Router();
  const perRequest = options.transcriptionPerRequest ?? 10;
  const perTenant = options.transcriptionPerTenant ?? 60;
  const understandingLimit = options.understandingPerTenant ?? 60;
  const perPerson = options.perPersonDaily ?? 4;
  // Async so a missing key becomes a rejection the mapping below can see (TEAM-01-13).
  const transcribe = async (input: XaiTranscriptionInput) =>
    options.transcription
      ? options.transcription(input)
      : transcribeWithXai(input, xaiApiKey());
  const understand = async (input: UnderstandingContext) =>
    options.understanding
      ? options.understanding(input)
      : understandWithXai(input, xaiApiKey());
  // Checked before any cap is counted or audio is stored: configuration gaps
  // are not attempts and cannot succeed on a retry.
  const assertConfigured = (kind: "transcription" | "understanding") => {
    const injected =
      kind === "transcription" ? options.transcription : options.understanding;
    if (injected || process.env.XAI_API_KEY) return;
    if (kind === "transcription")
      fail(
        503,
        "TRANSCRIPTION_NOT_CONFIGURED",
        "Voice transcription is not configured. You can still type your answer.",
      );
    fail(
      503,
      "UNDERSTANDING_NOT_CONFIGURED",
      "Understanding is not configured. Send your own words for advisor review.",
    );
  };
  /** Daily cap per company: a floor plus a share per person on the roster. */
  const companyCap = async (db: any, companyId: string, floor: number) => {
    const people = Number(
      (
        await db.query(
          "SELECT count(*) FROM records WHERE company_id=$1 AND kind='person'",
          [companyId],
        )
      ).rows[0].count,
    );
    return Math.max(floor, people * perPerson);
  };

  router.post("/enroll", async (req, res) => {
    const session = await enrollParticipant(
      req.body,
      req.header("Idempotency-Key") || "",
    );
    res.status(session.idempotentReplay ? 200 : 201).json(session);
  });
  router.post("/session/refresh", async (req, res) => {
    res.json(
      await refreshParticipant(req.body, req.header("Idempotency-Key") || ""),
    );
  });
  // Logout is idempotent: a repeat for an already revoked session is 204 (TEAM-01-16).
  router.post("/session/logout", async (req, res, next) => {
    try {
      if (await sessionAlreadyRevoked(req)) {
        res.status(204).end();
        return;
      }
    } catch (error) {
      next(error);
      return;
    }
    await authenticateMobile(req, res, async (error?: unknown) => {
      if (error) return next(error);
      try {
        await logoutParticipant(mobileActor(req));
        res.status(204).end();
      } catch (failure) {
        next(failure);
      }
    });
  });
  router.use(authenticateMobile);
  router.get("/me", async (req, res) => {
    res.json(await readMobileProfile(mobileActor(req)));
  });
  router.patch("/me/preferences", async (req, res) => {
    res.json(await updateMobilePreferences(mobileActor(req), req.body));
  });
  router.put("/me/push-token", async (req, res) => {
    res.json(await registerPushToken(mobileActor(req), req.body));
  });
  router.get("/requests", async (req, res) => {
    const actor = mobileActor(req);
    const scope = z.enum(["needs-you", "all"]).default("needs-you").parse(req.query.scope);
    res.json(
      await tx(actor.tenant_id, async (db) => {
        const rows = (
          await db.query(
            "SELECT * FROM records WHERE company_id=$1 AND kind='request' AND data->>'personId'=$2 AND state NOT IN ('draft','withdrawn') ORDER BY created_at DESC",
            [actor.company_id, actor.person_id],
          )
        ).rows;
        const requests = rows
          .filter(companionAnswerable)
          .filter((request) => (scope === "all" ? true : needsYou(request)))
          .map(requestSummary);
        return { requests };
      }),
    );
  });
  router.get("/requests/:requestId", async (req, res) => {
    const actor = mobileActor(req);
    const requestId = z.uuid().parse(req.params.requestId);
    res.json(
      await tx(actor.tenant_id, async (db) => {
        const request = await assignedRequest(db, actor, requestId);
        const advisorName = await requestAdvisorName(
          db,
          actor.tenant_id,
          actor.company_id,
          request.id,
        );
        const stageLabel = String(request.data.gapContext?.stageLabel || "");
        return {
          ...requestSummary(request),
          questions: questionList(request, advisorName),
          questionPlanVersion: String(request.data.questionPlanVersion || ""),
          gapFollowup: String(request.data.questionPlanVersion || "").startsWith(
            "work-gap:",
          ),
          ...(stageLabel ? { stageLabel: stageLabel.slice(0, 200) } : {}),
          ...(request.data.notice ? { notice: String(request.data.notice) } : {}),
          advisorName,
        };
      }),
    );
  });
  router.post(
    "/requests/:requestId/transcriptions",
    express.raw({ type: "multipart/form-data", limit: "26mb" }),
    async (req, res) => {
      const actor = mobileActor(req);
      const requestId = z.uuid().parse(req.params.requestId);
      const key = idempotencyKey(req);
      const header = (req.header("content-type") || "").split(";")[0].trim().toLowerCase();
      let uploadBytes: Buffer | undefined;
      let uploadMime = "";
      let savedAssetId = "";
      let retry = false;
      let meta: { expectedVersion: number; contentHash: string; language?: string };
      if (header === "application/json") {
        const body = mobileTranscriptionAssetBody.parse(req.body);
        meta = body;
        retry = body.retry;
        savedAssetId = body.assetId;
      } else if (header === "multipart/form-data") {
        const upload = parseCompanionAudioUpload(
          req.header("content-type") || "",
          req.body,
        );
        if (upload.bytes.length > AUDIO_LIMIT)
          return fail(413, "AUDIO_SIZE", "The clip is larger than 25 MB.");
        uploadBytes = upload.bytes;
        uploadMime = upload.mime;
        meta = upload.meta;
      } else {
        return fail(422, "AUDIO_TYPE", "Send multipart audio or a saved asset id.");
      }
      const prepared = await tx(actor.tenant_id, async (db) => {
        const request = await assignedRequest(db, actor, requestId, true);
        assertOpen(request, meta.expectedVersion, meta.contentHash);
        assertConfigured("transcription");
        let bytes = uploadBytes;
        let mime = uploadMime;
        let assetId = savedAssetId;
        let audioHash = "";
        if (assetId) {
          const asset = (
            await db.query("SELECT * FROM assets WHERE company_id=$1 AND id=$2", [
              actor.company_id,
              assetId,
            ])
          ).rows[0];
          if (!asset || asset.request_id !== request.id)
            fail(404, "REQUEST_NOT_FOUND", "That audio is not stored for this request.");
          if (asset.person_id !== actor.person_id)
            fail(403, "PERSON_FORBIDDEN", "That audio belongs to someone else.");
          const chunks = (
            await db.query(
              "SELECT bytes FROM asset_chunks WHERE company_id=$1 AND asset_id=$2 ORDER BY chunk_index",
              [actor.company_id, assetId],
            )
          ).rows;
          bytes = Buffer.concat(chunks.map((row: { bytes: Buffer }) => row.bytes));
          mime = asset.mime;
          audioHash = asset.checksum;
          if (!retry) {
            const saved = (
              await db.query(
                "SELECT * FROM provider_jobs WHERE company_id=$1 AND kind='mobile_transcription' AND state='succeeded' AND input->>'assetId'=$2 AND input->>'personId'=$3 ORDER BY created_at DESC LIMIT 1",
                [actor.company_id, assetId, actor.person_id],
              )
            ).rows[0];
            if (saved) return { replay: transcriptionBody(saved, false) };
          }
        }
        if (!bytes || bytes.length === 0)
          return fail(422, "AUDIO_REQUIRED", "The audio file was empty.");
        const audioBytes: Buffer = bytes;
        if (!audioHash)
          audioHash = createHash("sha256").update(audioBytes).digest("hex");
        const existing = (
          await db.query(
            "SELECT * FROM provider_jobs WHERE company_id=$1 AND kind='mobile_transcription' AND input->>'personId'=$2 AND input->>'idempotencyKey'=$3 ORDER BY created_at DESC LIMIT 1",
            [actor.company_id, actor.person_id, key],
          )
        ).rows[0];
        if (existing) {
          if (existing.input.audioHash !== audioHash)
            fail(
              409,
              "IDEMPOTENCY_CONFLICT",
              "This transcription key was already used for a different recording.",
            );
          if (existing.state === "succeeded")
            return { replay: transcriptionBody(existing, true) };
          if (existing.state === "running")
            fail(
              409,
              "TRANSCRIPTION_IN_PROGRESS",
              "This recording is already being transcribed. Wait, or type your answer.",
            );
          fail(
            409,
            "IDEMPOTENCY_CONFLICT",
            "This key was used for a transcription that did not finish. Send a new Idempotency-Key to try again.",
          );
        }
        // Failed attempts do not count against the caps (TEAM-01-30).
        const count = (
          await db.query(
            "SELECT count(*) FROM provider_jobs WHERE company_id=$1 AND kind='mobile_transcription' AND state IN ('succeeded','running') AND created_at>now()-interval '24 hours'",
            [actor.company_id],
          )
        ).rows[0].count;
        const mine = (
          await db.query(
            "SELECT count(*) FROM provider_jobs WHERE company_id=$1 AND kind='mobile_transcription' AND state IN ('succeeded','running') AND input->>'requestId'=$2 AND created_at>now()-interval '24 hours'",
            [actor.company_id, request.id],
          )
        ).rows[0].count;
        if (
          Number(count) >= (await companyCap(db, actor.company_id, perTenant)) ||
          Number(mine) >= perRequest
        )
          fail(
            429,
            "TRANSCRIPTION_LIMIT",
            "The daily transcription limit has been reached. Type your answer instead.",
          );
        if (!assetId) {
          assetId = randomUUID();
          await db.query(
            "INSERT INTO assets(id,tenant_id,company_id,person_id,request_id,mime,size,checksum,state) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'stored_unscanned')",
            [
              assetId,
              actor.tenant_id,
              actor.company_id,
              actor.person_id,
              request.id,
              mime,
              audioBytes.length,
              audioHash,
            ],
          );
          await db.query(
            "INSERT INTO asset_chunks(tenant_id,company_id,asset_id,chunk_index,bytes,checksum) VALUES($1,$2,$3,0,$4,$5)",
            [actor.tenant_id, actor.company_id, assetId, audioBytes, audioHash],
          );
        }
        const person = await getRecord(db, actor.company_id, actor.person_id);
        const company = (
          await db.query("SELECT name FROM companies WHERE id=$1", [actor.company_id])
        ).rows[0];
        const keyterms = requestKeyterms([
          company.name,
          person.data.role || "",
          person.data.team || "",
          ...(request.data.questions || []),
        ]);
        const jobId = randomUUID();
        await db.query(
          "INSERT INTO provider_jobs(id,tenant_id,company_id,kind,state,input) VALUES($1,$2,$3,'mobile_transcription','running',$4)",
          [
            jobId,
            actor.tenant_id,
            actor.company_id,
            JSON.stringify({
              provider: "xai",
              model: XAI_STT_MODEL,
              schemaVersion: XAI_STT_SCHEMA,
              promptVersion: XAI_STT_SCHEMA,
              requestHash: request.hash,
              requestId: request.id,
              personId: actor.person_id,
              deviceId: actor.device_id,
              assetId,
              audioHash,
              mime,
              byteLength: audioBytes.length,
              keytermCount: keyterms.length,
              idempotencyKey: key,
              store: false,
            }),
          ],
        );
        const sponsor = await sponsorUser(db, actor);
        await audit(db, sponsor, actor.company_id, "mobile.transcription_requested", request.id, {
          personId: actor.person_id,
          deviceId: actor.device_id,
          jobId,
          model: XAI_STT_MODEL,
          audioHash,
        });
        return {
          jobId,
          keyterms,
          bytes: audioBytes,
          mime,
          language: meta.language || "en",
        };
      });
      if ("replay" in prepared) {
        res.json(prepared.replay);
        return;
      }
      try {
        const result = await transcribe({
          bytes: prepared.bytes,
          mime: prepared.mime,
          language: prepared.language,
          keyterms: prepared.keyterms,
        }).catch((error: unknown) => {
          if (error instanceof AppError && error.code === "VOICE_UNAVAILABLE")
            return fail(
              503,
              "TRANSCRIPTION_NOT_CONFIGURED",
              "Voice transcription is not configured. You can still type your answer.",
            );
          throw error;
        });
        const transcriptHash = hash(result.text);
        const row = await tx(actor.tenant_id, async (db) => {
          await db.query(
            "UPDATE provider_jobs SET state='succeeded',result=$2,finished_at=now() WHERE id=$1",
            [
              prepared.jobId,
              JSON.stringify({
                text: result.text,
                transcriptHash,
                model: result.model,
                providerRequestId: result.requestId,
              }),
            ],
          );
          const sponsor = await sponsorUser(db, actor);
          await audit(db, sponsor, actor.company_id, "mobile.transcription_completed", requestId, {
            personId: actor.person_id,
            jobId: prepared.jobId,
            model: result.model,
            transcriptHash,
            providerRequestId: result.requestId,
          });
          return (
            await db.query("SELECT * FROM provider_jobs WHERE id=$1", [prepared.jobId])
          ).rows[0];
        });
        res.json(transcriptionBody(row, false));
      } catch (error) {
        await tx(actor.tenant_id, async (db) => {
          await db.query(
            "UPDATE provider_jobs SET state='failed',message=$2,finished_at=now() WHERE id=$1 AND state='running'",
            [
              prepared.jobId,
              error instanceof Error ? error.message.slice(0, 300) : "Transcription failed",
            ],
          );
          const sponsor = await sponsorUser(db, actor);
          await audit(db, sponsor, actor.company_id, "mobile.transcription_failed", requestId, {
            personId: actor.person_id,
            jobId: prepared.jobId,
            model: XAI_STT_MODEL,
          });
        });
        throw error;
      }
    },
  );
  router.post(
    "/requests/:requestId/transcription-stream-ticket",
    async (req, res) => {
      const actor = mobileActor(req);
      const requestId = z.uuid().parse(req.params.requestId);
      await tx(actor.tenant_id, async (db) => {
        const request = await assignedRequest(db, actor, requestId);
        if (request.state !== "sent" || pastDue(request))
          fail(410, "REQUEST_CLOSED", "This request is closed.");
      });
      fail(
        501,
        "STREAMING_NOT_AVAILABLE",
        "Live transcription is not available. Upload a recording or type your answer.",
      );
    },
  );
  router.post("/requests/:requestId/understanding", async (req, res) => {
    const actor = mobileActor(req);
    const requestId = z.uuid().parse(req.params.requestId);
    const key = idempotencyKey(req);
    const body = mobileUnderstandingBody.parse(req.body);
    const sourceAnswerHash = hash(body.sourceText);
    const prepared = await tx(actor.tenant_id, async (db) => {
      const request = await assignedRequest(db, actor, requestId, true);
      assertOpen(request, body.expectedVersion, body.contentHash);
      assertConfigured("understanding");
      const existing = (
        await db.query(
          "SELECT * FROM provider_jobs WHERE company_id=$1 AND kind='mobile_understanding' AND input->>'personId'=$2 AND input->>'idempotencyKey'=$3 ORDER BY created_at DESC LIMIT 1",
          [actor.company_id, actor.person_id, key],
        )
      ).rows[0];
      if (existing) {
        if (existing.input.sourceAnswerHash !== sourceAnswerHash)
          fail(
            409,
            "IDEMPOTENCY_CONFLICT",
            "This understanding key was already used for a different answer.",
          );
        if (existing.state === "succeeded")
          return { replay: understandingBody(existing, true) };
        if (existing.state === "running")
          fail(
            409,
            "UNDERSTANDING_IN_PROGRESS",
            "This answer is already being read. You can still send your own words.",
          );
        fail(
          409,
          "IDEMPOTENCY_CONFLICT",
          "This key was used for a draft that did not finish. Send a new Idempotency-Key, or submit your own words.",
        );
      }
      const count = (
        await db.query(
          "SELECT count(*) FROM provider_jobs WHERE company_id=$1 AND kind='mobile_understanding' AND state IN ('succeeded','running') AND created_at>now()-interval '24 hours'",
          [actor.company_id],
        )
      ).rows[0].count;
      if (
        Number(count) >=
        (await companyCap(db, actor.company_id, understandingLimit))
      )
        fail(
          429,
          "DRAFT_LIMIT",
          "The daily draft limit has been reached. Send your answer for advisor review.",
        );
      if (body.source === "reviewed_transcript") {
        const transcript = (
          await db.query(
            "SELECT id FROM provider_jobs WHERE id=$1 AND company_id=$2 AND kind='mobile_transcription' AND state='succeeded' AND input->>'requestId'=$3 AND input->>'personId'=$4",
            [body.transcriptJobId, actor.company_id, request.id, actor.person_id],
          )
        ).rows[0];
        if (!transcript)
          fail(
            422,
            "VALIDATION_ERROR",
            "That transcript is not a completed job for this request.",
          );
      }
      const person = await getRecord(db, actor.company_id, actor.person_id);
      const duties = (
        await db.query(
          "SELECT title,data->>'purpose' AS purpose FROM records WHERE company_id=$1 AND kind='duty' AND data->>'ownerId'=$2 AND state NOT IN ('stale','retracted','withdrawn') ORDER BY created_at,id LIMIT 8",
          [actor.company_id, actor.person_id],
        )
      ).rows.map((row: any) => `${row.title}: ${row.purpose || ""}`);
      const jobId = randomUUID();
      await db.query(
        "INSERT INTO provider_jobs(id,tenant_id,company_id,kind,state,input) VALUES($1,$2,$3,'mobile_understanding','running',$4)",
        [
          jobId,
          actor.tenant_id,
          actor.company_id,
          JSON.stringify({
            provider: "xai",
            model: XAI_GENERATION_MODEL,
            reasoning: XAI_GENERATION_REASONING,
            schemaVersion: COMPANION_UNDERSTANDING_SCHEMA,
            promptVersion: COMPANION_UNDERSTANDING_SCHEMA,
            store: false,
            requestId: request.id,
            personId: actor.person_id,
            deviceId: actor.device_id,
            requestHash: request.hash,
            sourceAnswerHash,
            idempotencyKey: key,
            transcriptJobId: body.transcriptJobId || "",
            source: body.source,
          }),
        ],
      );
      const sponsor = await sponsorUser(db, actor);
      await audit(
        db,
        sponsor,
        actor.company_id,
        "mobile.understanding_requested",
        request.id,
        {
          personId: actor.person_id,
          jobId,
          model: XAI_GENERATION_MODEL,
          schemaVersion: COMPANION_UNDERSTANDING_SCHEMA,
          sourceAnswerHash,
          source: body.source,
        },
      );
      return {
        jobId,
        requestHash: request.hash,
        context: {
          requestId: request.id,
          questions: request.data.questions || [],
          participant: {
            role: person.data.role || "",
            team: person.data.team || "",
          },
          duties,
          answerText: body.sourceText,
        } satisfies UnderstandingContext,
      };
    });
    if ("replay" in prepared) {
      res.json(prepared.replay);
      return;
    }
    try {
      const generated = await understand(prepared.context).catch((error: unknown) => {
        if (error instanceof AppError && error.code === "VOICE_UNAVAILABLE")
          return fail(
            503,
            "UNDERSTANDING_NOT_CONFIGURED",
            "Understanding is not configured. You can still send your own words.",
          );
        throw error;
      });
      const drafted = draftUnderstanding(body.sourceText, generated.output);
      const proposal = {
        ...drafted,
        sourceAnswerHash,
        schemaVersion: COMPANION_UNDERSTANDING_SCHEMA,
        model: generated.model,
        promptVersion: COMPANION_UNDERSTANDING_SCHEMA,
        providerRequestId: generated.requestId,
        requestHash: prepared.requestHash,
      };
      const row = await tx(actor.tenant_id, async (db) => {
        const current = await assignedRequest(db, actor, requestId);
        assertOpen(current, body.expectedVersion, body.contentHash);
        await db.query(
          "UPDATE provider_jobs SET state='succeeded',result=$2,finished_at=now() WHERE id=$1",
          [prepared.jobId, JSON.stringify(proposal)],
        );
        const sponsor = await sponsorUser(db, actor);
        await audit(
          db,
          sponsor,
          actor.company_id,
          "mobile.understanding_completed",
          requestId,
          {
            personId: actor.person_id,
            jobId: prepared.jobId,
            model: generated.model,
            schemaVersion: generated.schemaVersion,
            sourceAnswerHash,
            providerRequestId: generated.requestId,
            cardCount: proposal.tasks.length,
          },
        );
        return (await db.query("SELECT * FROM provider_jobs WHERE id=$1", [prepared.jobId]))
          .rows[0];
      });
      res.json(understandingBody(row, false));
    } catch (error) {
      await tx(actor.tenant_id, async (db) => {
        await db.query(
          "UPDATE provider_jobs SET state='failed',message=$2,finished_at=now() WHERE id=$1 AND state='running'",
          [
            prepared.jobId,
            "Understanding did not complete. The participant can still send their own words.",
          ],
        );
        const sponsor = await sponsorUser(db, actor);
        await audit(
          db,
          sponsor,
          actor.company_id,
          "mobile.understanding_failed",
          requestId,
          {
            personId: actor.person_id,
            jobId: prepared.jobId,
            model: XAI_GENERATION_MODEL,
            schemaVersion: COMPANION_UNDERSTANDING_SCHEMA,
          },
        );
      });
      throw error;
    }
  });
  // v1.2 "is this enough?" for one card. Not stored; no Idempotency-Key (only the audit count changes).
  router.post("/requests/:requestId/coverage", async (req, res) => {
    const actor = mobileActor(req);
    const requestId = z.uuid().parse(req.params.requestId);
    const body = answerCoverageBody.parse(req.body);
    const prepared = await tx(actor.tenant_id, async (db) => {
      const request = await assignedRequest(db, actor, requestId);
      assertAnswerable(request);
      const question = requestQuestions(request).find((q) => q.key === body.questionKey);
      if (!question)
        fail(422, "VALIDATION_ERROR", "That question is not part of this request.");
      const gate = await coverageGate(db, {
        tenantId: actor.tenant_id,
        companyId: actor.company_id,
        requestId: request.id,
        personId: actor.person_id,
        questionKey: body.questionKey,
        injected: options.answerModel,
      });
      return { gate, question: question! };
    });
    res.json(await runCoverage(prepared.gate, prepared.question, body.text));
  });
  // v1.2 "Here's what we heard": the web team page's call and limit (event team.understand_requested).
  router.post("/requests/:requestId/understand", async (req, res) => {
    const actor = mobileActor(req);
    const requestId = z.uuid().parse(req.params.requestId);
    const asked = understandRequestSchema.parse(req.body);
    const gate = await tx(actor.tenant_id, async (db) => {
      const request = await assignedRequest(db, actor, requestId);
      assertAnswerable(request);
      return understandGate(db, {
        tenantId: actor.tenant_id,
        companyId: actor.company_id,
        requestId: request.id,
        personId: actor.person_id,
        event: "team.understand_requested",
        injected: options.answerModel,
      });
    });
    res.json(await runUnderstand(gate, asked));
  });
  router.post("/requests/:requestId/submit", async (req, res) => {
    const actor = mobileActor(req);
    const requestId = z.uuid().parse(req.params.requestId);
    const body = mobileSubmitBody.parse(req.body);
    let wrote = false;
    const result = await command(
      mobileCommandUser(actor),
      idempotencyKey(req),
      { path: req.originalUrl, body },
      async (db) => {
        wrote = true;
        const request = await assignedRequest(db, actor, requestId, true);
        assertOpen(request, body.expectedVersion, body.contentHash);
        const sponsor = await sponsorUser(db, actor);
        const understanding = body.understanding;
        let proposal: any = null;
        if (understanding) {
          proposal = (
            await db.query(
              "SELECT * FROM provider_jobs WHERE company_id=$1 AND kind='mobile_understanding' AND state='succeeded' AND input->>'personId'=$2 AND input->>'requestId'=$3 AND result->>'contentHash'=$4 ORDER BY created_at DESC LIMIT 1",
              [
                actor.company_id,
                actor.person_id,
                request.id,
                understanding.contentHash,
              ],
            )
          ).rows[0];
          if (!proposal || proposal.result.sourceAnswerHash !== hash(body.text))
            fail(
              409,
              "HASH_CONFLICT",
              "The request or understanding hash does not match the saved record.",
            );
        }
        const cards = (understanding?.tasks || []).map((task) => ({
          proposalCardId: randomUUID(),
          title: task.title,
          duty: task.duty,
          purpose: known(task.purpose),
          trigger: known(task.trigger),
          inputs: task.inputs,
          instructions: task.instructions,
          output: task.output,
          handoff: task.handoff,
          software: task.software,
          humanGate: known(task.humanGate),
          decision: task.decision,
          ...(task.missingFields?.length
            ? {
                missingFields: task.missingFields.filter(
                  (field) => String((task as any)[field] || "").trim() === NOT_STATED,
                ),
              }
            : {}),
        }));
        for (const card of cards)
          if (
            card.decision !== "not_mine" &&
            (card.title === blank || card.duty === blank)
          )
            fail(422, "CARD_INCOMPLETE", "A proposed card needs a title and a duty.");
        // Participant corrections are kept next to what was proposed (TEAM-01-21).
        const proposedTasks: any[] = proposal?.result?.tasks || [];
        const edits: { cardIndex: number; field: string; proposed: string; confirmed: string }[] = [];
        cards.forEach((card, cardIndex) => {
          const proposed = proposedTasks[cardIndex];
          if (!proposed) return;
          for (const field of [
            "title",
            "duty",
            "purpose",
            "trigger",
            "inputs",
            "instructions",
            "output",
            "handoff",
            "software",
            "humanGate",
          ]) {
            const before = String(proposed[field] ?? "");
            const after = String((card as any)[field] ?? "");
            if (!before && after === blank) continue;
            if (before !== after)
              edits.push({
                cardIndex,
                field,
                proposed: before.slice(0, 3000),
                confirmed: after.slice(0, 3000),
              });
          }
        });
        // v1.3: where each answer's words came from, kept only for answers that have words (as the web team page).
        const sources = sourcesForAnswers(body.questionAnswerSources, body.questionAnswers);
        const recorded = await recordParticipantAnswer(
          db,
          sponsor,
          actor.company_id,
          request,
          {
            channel: "participant_mobile",
            personId: actor.person_id,
            deviceId: actor.device_id,
            text: body.text,
            assetId: body.audioAssetId,
            cards,
            proposal: proposal
              ? {
                  id: proposal.id,
                  sourceAnswerHash: proposal.result.sourceAnswerHash,
                  schemaVersion: proposal.result.schemaVersion,
                  model: proposal.result.model,
                }
              : null,
            understandingUnavailable: !understanding,
            gaps: proposal?.result?.gaps || [],
            edits,
            transcriptJobId: body.transcriptJobId,
            // v1.2 words path: the web team page's per-question fields (zod refuses them with an understanding).
            ...(body.questionAnswers ? { questionAnswers: body.questionAnswers } : {}),
            ...(body.questionUnderstood ? { questionUnderstood: body.questionUnderstood } : {}),
            ...(body.questionSuggestions ? { questionSuggestions: body.questionSuggestions } : {}),
            ...(body.questionResponses && Object.keys(body.questionResponses).length
              ? { questionResponses: body.questionResponses }
              : {}),
            ...(body.responseText ? { responseText: body.responseText } : {}),
            ...(Object.keys(sources).length ? { questionAnswerSources: sources } : {}),
            reason: understanding
              ? "Participant submitted via Companion; sponsoring account records the write"
              : "Participant sent their own words via Companion without an understanding; unreviewed",
          },
        );
        const response = recorded.response;
        const taskIds = recorded.taskIds;
        await setState(
          db,
          sponsor,
          actor.company_id,
          request,
          "returned",
          "request.returned",
        );
        await db.query(
          "UPDATE invitations SET used_at=COALESCE(used_at, now()) WHERE request_id=$1 AND revoked_at IS NULL",
          [request.id],
        );
        await audit(db, sponsor, actor.company_id, "mobile.submitted", request.id, {
          personId: actor.person_id,
          deviceId: actor.device_id,
          responseId: response.id,
          responseHash: response.hash,
          proposalId: proposal?.id || null,
          taskIds,
          understandingUnavailable: !understanding,
          perQuestion: Boolean(body.questionAnswers || body.questionResponses),
          assurance: "invitation_possession",
        });
        // The same short receipt as the web team link (TEAM-01-10), when email is set up.
        const receiptTo = (
          await db.query(
            "SELECT email FROM invitations WHERE company_id=$1 AND request_id=$2 AND person_id=$3 AND revoked_at IS NULL ORDER BY expires_at DESC LIMIT 1",
            [actor.company_id, request.id, actor.person_id],
          )
        ).rows[0]?.email;
        const person = await getRecord(db, actor.company_id, actor.person_id);
        await queueParticipantReceipt(
          db,
          actor.company_id,
          String(receiptTo || person.data.email || ""),
          request.id,
        );
        const job = await enqueueGapReply(
          db,
          sponsor,
          actor.company_id,
          request,
          response,
        );
        await queueFillExtraction(db, actor.tenant_id, actor.company_id, response.id, "companion");
        const returned = await getRecord(db, actor.company_id, request.id);
        return {
          responseId: response.id,
          requestId: request.id,
          requestState: "returned" as const,
          version: returned.version,
          reviewState: understanding
            ? ("cards_proposed" as const)
            : ("words_unreviewed" as const),
          reconciliation: job
            ? { jobId: job.id, state: "queued" as const }
            : { state: "not_requested" as const },
        };
      },
    );
    if (result.reconciliation.state === "queued" && result.reconciliation.jobId) {
      const work = processGapReply(
        actor.tenant_id,
        result.reconciliation.jobId,
        options.gapReplyProvider,
      ).catch(() => {
        /* The submitted response stays saved if later reconciliation fails. */
      });
      if (process.env.VERCEL) waitUntil(work);
      else void work;
    }
    res.status(wrote ? 201 : 200).json({
      ...result,
      idempotentReplay: !wrote,
    });
  });
  router.get("/task-cards", async (req, res) => {
    const actor = mobileActor(req);
    const filter = z.enum(["needs_attestation"]).optional().parse(req.query.state);
    res.json(
      await tx(actor.tenant_id, async (db) => {
        const tasks = (
          await db.query(
            "SELECT * FROM records WHERE company_id=$1 AND kind='task' AND (data->>'performerId'=$2 OR data->>'ownerId'=$2) AND state NOT IN ('retracted','withdrawn','stale') ORDER BY created_at DESC",
            [actor.company_id, actor.person_id],
          )
        ).rows;
        const views = [];
        for (const task of tasks) {
          const confirmation = (
            await db.query(
              "SELECT decision FROM confirmations WHERE company_id=$1 AND record_id=$2 AND version=$3 AND person_id=$4 LIMIT 1",
              [actor.company_id, task.id, task.version, actor.person_id],
            )
          ).rows[0];
          const needsAttestation =
            task.state === "awaiting_confirmation" || !confirmation;
          if (filter === "needs_attestation" && !needsAttestation) continue;
          views.push(taskView(task, needsAttestation));
        }
        return { taskCards: views };
      }),
    );
  });
  router.get("/task-cards/:taskCardId", async (req, res) => {
    const actor = mobileActor(req);
    const taskId = z.uuid().parse(req.params.taskCardId);
    res.json(
      await tx(actor.tenant_id, async (db) => {
        const task = await ownTask(db, actor, taskId);
        const confirmation = (
          await db.query(
            "SELECT decision FROM confirmations WHERE company_id=$1 AND record_id=$2 AND version=$3 AND person_id=$4 LIMIT 1",
            [actor.company_id, task.id, task.version, actor.person_id],
          )
        ).rows[0];
        return taskView(
          task,
          task.state === "awaiting_confirmation" || !confirmation,
        );
      }),
    );
  });
  router.post("/task-cards/:taskCardId/attest", async (req, res) => {
    const actor = mobileActor(req);
    const taskId = z.uuid().parse(req.params.taskCardId);
    const body = mobileAttestBody.parse(req.body);
    if (body.decision === "correction" && !body.correction?.trim())
      fail(422, "CORRECTION_REQUIRED", "Add the correction in your own words.");
    res.json(
      await command(
        mobileCommandUser(actor),
        idempotencyKey(req),
        { path: req.originalUrl, body },
        async (db) => {
          const task = await ownTask(db, actor, taskId, true);
          const before = task.hash;
          if (task.version !== body.recordVersion || task.hash !== body.contentHash)
            fail(
              409,
              "VERSION_CONFLICT",
              "This task card changed. Reload it before attesting.",
            );
          const sponsor = await sponsorUser(db, actor);
          const requestId = await attestationRequest(db, actor, task);
          const decision = confirmationDecision(body.decision);
          // A duplicate confirmation aborts the surrounding transaction unless
          // it is rolled back to a savepoint first.
          await db.query("SAVEPOINT participant_attestation");
          try {
            await db.query(
              "INSERT INTO confirmations(id,tenant_id,company_id,record_id,version,hash,person_id,user_id,request_id,decision,note) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
              [
                randomUUID(),
                actor.tenant_id,
                actor.company_id,
                task.id,
                task.version,
                task.hash,
                actor.person_id,
                sponsor.id,
                requestId,
                decision,
                body.correction || "Participant attestation. This is not company approval.",
              ],
            );
            await db.query("RELEASE SAVEPOINT participant_attestation");
          } catch (error: any) {
            await db.query("ROLLBACK TO SAVEPOINT participant_attestation");
            if (error.code !== "23505") throw error;
            const existing = (
              await db.query(
                "SELECT decision FROM confirmations WHERE company_id=$1 AND record_id=$2 AND version=$3 AND person_id=$4 AND request_id=$5",
                [actor.company_id, task.id, task.version, actor.person_id, requestId],
              )
            ).rows[0];
            if (!existing || existing.decision !== decision)
              fail(
                409,
                "ATTESTATION_EXISTS",
                "This exact task card version already has a different attestation.",
              );
          }
          const after = await getRecord(db, actor.company_id, task.id);
          if (after.hash !== before || after.version !== task.version)
            fail(500, "TASK_MUTATED", "Attestation must not change the task card.");
          await audit(db, sponsor, actor.company_id, "mobile.task_attested", task.id, {
            personId: actor.person_id,
            deviceId: actor.device_id,
            version: task.version,
            hash: task.hash,
            decision,
            requestId,
          });
          const checkReturned = await returnCompletedCheck(
            db,
            sponsor,
            actor,
            requestId,
            body.correction || "",
          );
          return {
            ...(checkReturned ? { checkReturned: true } : {}),
            ok: true,
            taskCardId: task.id,
            version: task.version,
            hash: task.hash,
            decision: body.decision,
            taskUnchanged: true,
          };
        },
      ),
    );
  });
  router.post("/updates", async (req, res) => {
    const actor = mobileActor(req);
    const body = mobileUpdateBody.parse(req.body);
    res.json(
      await command(
        mobileCommandUser(actor),
        idempotencyKey(req),
        { path: req.originalUrl, body },
        async (db) => {
          const sponsor = await sponsorUser(db, actor);
          let related: any = null;
          if (body.taskCardId) {
            related = await ownTask(db, actor, body.taskCardId, true);
            if (
              (body.expectedTaskVersion &&
                related.version !== body.expectedTaskVersion) ||
              (body.expectedTaskHash && related.hash !== body.expectedTaskHash)
            )
              fail(
                409,
                "VERSION_CONFLICT",
                "That task card changed. Reload it before reporting a change.",
              );
          }
          const before = related?.hash || null;
          const evidence = await putRecord(
            db,
            sponsor,
            actor.company_id,
            "evidence",
            "Something changed",
            {
              title: "Something changed",
              type: "Employee account",
              text: body.text,
              personId: actor.person_id,
              bucket: "org",
              assetId: "",
              classification: "Known",
              locator: "Companion change signal",
              origin: "mobile_change",
              relatedTaskId: related?.id || "",
              relatedTaskVersion: related?.version || null,
              relatedTaskHash: related?.hash || "",
            },
            "proposed",
            undefined,
            "Participant reported a change. No task card was rewritten.",
          );
          if (related) {
            const after = await getRecord(db, actor.company_id, related.id);
            if (after.hash !== before)
              fail(500, "TASK_MUTATED", "A change report must not rewrite the task card.");
          }
          await audit(
            db,
            sponsor,
            actor.company_id,
            "mobile.change_reported",
            evidence.id,
            {
              personId: actor.person_id,
              deviceId: actor.device_id,
              evidenceId: evidence.id,
              relatedTaskId: related?.id || null,
              reconciliation: "not_run",
            },
          );
          return {
            ok: true,
            evidenceId: evidence.id,
            evidenceHash: evidence.hash,
            processing: false,
            reconciliation: "not_run",
          };
        },
      ),
    );
  });
  return router;
}

function taskView(task: any, needsAttestation: boolean) {
  return {
    id: task.id,
    title: task.title,
    version: task.version,
    hash: task.hash,
    state: task.state,
    needsAttestation,
    reviewed: Boolean(task.data.reviewed),
    data: {
      duty: task.data.duty,
      purpose: task.data.purpose,
      trigger: task.data.trigger,
      inputs: task.data.inputs,
      instructions: task.data.instructions,
      output: task.data.output,
      systems: task.data.systems,
      humanGate: task.data.humanGate,
      destination: task.data.destination,
      mode: task.data.mode,
    },
  };
}

async function ownTask(db: any, actor: MobileActor, taskId: string, lock = false) {
  const task = await getRecord(db, actor.company_id, taskId, lock);
  // Owners answer task checks too; either named person may read and attest.
  if (
    task.kind !== "task" ||
    ![task.data.performerId, task.data.ownerId].includes(actor.person_id)
  )
    fail(404, "NOT_FOUND", "Assigned task card not found.");
  return task;
}

async function attestationRequest(db: any, actor: MobileActor, task: any) {
  const open = (
    await db.query(
      "SELECT id,data FROM records WHERE company_id=$1 AND kind='request' AND data->>'personId'=$2 AND data->>'type'='confirmation' AND state='sent'",
      [actor.company_id, actor.person_id],
    )
  ).rows.find((row: any) =>
    (row.data.taskIds || []).includes(task.id) ||
    (row.data.taskSnapshots || []).some((snap: any) => snap.id === task.id),
  );
  if (open) {
    const snap = (open.data.taskSnapshots || []).find((item: any) => item.id === task.id);
    if (snap && (snap.version !== task.version || snap.hash !== task.hash))
      fail(
        409,
        "VERSION_CONFLICT",
        "The confirmation request is for a different task card version.",
      );
    return open.id as string;
  }
  if (!task.data.participantResponseId)
    fail(
      409,
      "ATTESTATION_CONTEXT",
      "This task card is not ready for a participant attestation.",
    );
  const response = await getRecord(db, actor.company_id, task.data.participantResponseId);
  if (response.kind !== "response" || response.data.personId !== actor.person_id)
    fail(404, "NOT_FOUND", "The original response was not found.");
  return response.data.requestId as string;
}

/**
 * A task check answered card by card in the app becomes the same returned
 * response the web check produces, once every card in it is attested, so the
 * advisor's accept counts the confirmations (TEAM-01-31).
 */
async function returnCompletedCheck(
  db: any,
  sponsor: any,
  actor: MobileActor,
  requestId: string,
  note: string,
) {
  const request = await getRecord(db, actor.company_id, requestId, true);
  if (
    request.kind !== "request" ||
    request.data.type !== "confirmation" ||
    request.state !== "sent"
  )
    return false;
  const snapshots: any[] = request.data.taskSnapshots || [];
  if (!snapshots.length) return false;
  const rows = (
    await db.query(
      "SELECT record_id,version,decision FROM confirmations WHERE company_id=$1 AND request_id=$2 AND person_id=$3",
      [actor.company_id, request.id, actor.person_id],
    )
  ).rows;
  const decisions: Record<string, string> = {};
  for (const snap of snapshots) {
    const row = rows.find(
      (item: any) => item.record_id === snap.id && item.version === snap.version,
    );
    if (!row) return false;
    decisions[snap.id] = row.decision;
  }
  const response = await putRecord(
    db,
    sponsor,
    actor.company_id,
    "response",
    (request.title + " — response").slice(0, 200),
    {
      requestId: request.id,
      personId: actor.person_id,
      text: "",
      assetId: "",
      decisions,
      note: note.slice(0, 10000),
      taskCards: [],
      submissionIdentity: {
        method: "participant_mobile",
        personId: actor.person_id,
        deviceId: actor.device_id,
        independentlyVerified: false,
        assurance: "invitation_possession",
      },
    },
    "returned",
    undefined,
    "Participant attested every card in this check via Companion",
  );
  await setState(db, sponsor, actor.company_id, request, "returned", "request.returned");
  await db.query(
    "UPDATE invitations SET used_at=COALESCE(used_at, now()) WHERE request_id=$1 AND revoked_at IS NULL",
    [request.id],
  );
  await audit(db, sponsor, actor.company_id, "mobile.check_returned", request.id, {
    personId: actor.person_id,
    responseId: response.id,
  });
  return true;
}
