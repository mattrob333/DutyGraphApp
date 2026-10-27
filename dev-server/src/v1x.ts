import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  Store,
  authenticate,
  principal,
  fail,
  hash,
  uuid,
  checkVersion,
  version,
  requireKey,
  type Principal,
} from "./core.ts";
import { commands } from "./idempotency.ts";
import type { Config } from "./config.ts";
import type { Providers } from "./providers/index.ts";
import { dataBlock } from "./providers/index.ts";
import {
  mobileSubmitBody,
  answerCoverageBody,
} from "../../shared/mobile-contracts.ts";
import { coverLocally } from "../../shared/hands-free/coverage.ts";
import { gateMeeting, pulseTeamStatus } from "../../shared/meetings/rules.ts";
import type {
  MeetingDefinition,
  MeetingSession,
  MeetingProposal,
  SpeakerMap,
  Pulse,
  Person,
  ClosingItem,
} from "../../shared/meetings/types.ts";
import type { components } from "../../mobile/src/api/generated/companion-mobile-v1.ts";
import type {
  MeetingBrief,
  MeetingDetail,
  MeetingSummary,
} from "../../mobile/src/types/domain.ts";
type Schemas = components["schemas"];
type AudioAsset = { hash: string; file: string; durationMs: number };
const textBody = (p: MeetingProposal): string =>
  "what" in p.body
    ? p.body.what
    : "decision" in p.body
      ? p.body.decision
      : "value" in p.body
        ? p.body.value
        : "question" in p.body
          ? p.body.question
          : "duty" in p.body
            ? p.body.duty
            : p.kind === "task_card_delta" && "to" in p.body
              ? p.body.to
              : "Review this proposed change.";

export function v1xRoutes(store: Store, providers: Providers, config: Config) {
  const router = Router();
  const cmd = commands(store);
  router.use(authenticate(store, ["participant_mobile", "advisor_mobile"]));
  const onlyParticipant = (res: Response) => {
    const p = principal(res);
    if (p.role !== "participant_mobile")
      fail(403, "PERSON_FORBIDDEN", "This operation is for participants.");
    return p;
  };
  const counts = new Map<string, { at: number; count: number }>();
  function limit(key: string, max: number, window = 60000) {
    let bucket = counts.get(key);
    if (!bucket || Date.now() - bucket.at >= window) {
      bucket = { at: Date.now(), count: 0 };
      counts.set(key, bucket);
    }
    if (bucket.count >= max)
      fail(429, "RATE_LIMITED", "Please wait before trying again.");
    bucket.count++;
  }
  function rate(p: Principal, operation: string) {
    limit(`${p.sessionId}:${operation}`, 30);
    limit(`${p.companyId}:${operation}`, 120);
  }
  function ownPulse(id: string, p: Principal) {
    const pulse = store.get<Pulse>("pulses", id, p);
    const own = pulse.perPerson.find(
      (person) => person.personId === p.personId,
    );
    if (!own)
      fail(403, "PERSON_FORBIDDEN", "This Pulse is not assigned to you.");
    return { pulse, own };
  }
  function ownMeeting(id: string, p: Principal) {
    const meeting = store.get<MeetingDefinition>("meetings", id, p);
    if (
      p.role !== "advisor_mobile" &&
      !meeting.attendees.some((person) => person.personId === p.personId)
    )
      fail(403, "PERSON_FORBIDDEN", "This meeting is not assigned to you.");
    return meeting;
  }
  function questionContext(id: string, p: Principal) {
    if (id.startsWith("pulse:")) return ownPulse(id.slice(6), p).own.questions;
    return store.get<Schemas["ParticipantRequestDetail"]>(
      "requests",
      id,
      p,
      p.role === "participant_mobile",
    ).questions;
  }
  router.get("/config", (_req, res) =>
    res.json({
      speakQuestions: true,
      followUps: config.followUps,
      autoAdvance: config.autoAdvance,
      liveTranscription:
        providers.metadata.liveTranscription === "openai" ||
        config.providers.fakeLiveTranscription === true,
    }),
  );

  const lineSchema = z
    .object({
      requestId: z.string().max(100).optional(),
      sessionId: z.uuid().optional(),
      voice: z
        .string()
        .regex(/^[a-zA-Z0-9_-]{1,60}$/)
        .optional(),
      speed: z.number().min(0.5).max(2).optional(),
      lines: z
        .array(
          z
            .object({
              id: z.string().min(1).max(100),
              text: z.string().trim().min(1).max(400),
            })
            .strict(),
        )
        .min(1)
        .max(40),
    })
    .strict();
  router.post(
    "/voice/lines",
    cmd(async (req, res) => {
      const p = principal(res),
        body = lineSchema.parse(req.body);
      if (body.requestId) questionContext(body.requestId, p);
      if (body.sessionId)
        ownMeeting(
          store.get<MeetingSession>("sessions", body.sessionId, p).meetingId,
          p,
        );
      if (new Set(body.lines.map((line) => line.id)).size !== body.lines.length)
        fail(
          400,
          "VALIDATION_ERROR",
          "Use a different id for each voice line.",
        );
      rate(p, "tts");
      if (body.requestId)
        limit(
          `${p.companyId}:${p.personId}:${body.requestId}:tts`,
          12,
          86400000,
        );
      mkdirSync(config.audioDir, { recursive: true });
      const voice = body.voice || config.providers.ttsVoice || "marin",
        speed = body.speed || 1;
      const lines = [];
      for (const line of body.lines) {
        const contentHash = hash([
          config.providers.ttsModel || "gpt-4o-mini-tts",
          voice,
          speed,
          line.text,
        ]);
        const cacheId = hash([p.companyId, p.personId, contentHash]);
        const prior = store.records.voiceAudio?.[cacheId]?.value as
          AudioAsset | undefined;
        let asset = prior;
        if (!asset || !existsSync(asset.file)) {
          const output = await providers.tts.synthesize({
            text: line.text,
            voice,
            speed,
          });
          const file = join(config.audioDir, `${cacheId}.mp3`);
          writeFileSync(file, output.audio, { mode: 0o600 });
          asset = { hash: contentHash, durationMs: output.durationMs, file };
          // Only an audio hash and metadata are retained; never the source text.
          store.put("voiceAudio", cacheId, asset, p.companyId, p.personId);
        }
        lines.push({
          id: line.id,
          url: `/api/mobile/v1x/voice/audio/${contentHash}.mp3`,
          hash: contentHash,
          durationMs: asset.durationMs,
        });
      }
      return { body: { lines } };
    }),
  );
  router.get("/voice/audio/:hash", (req, res) => {
    const p = principal(res),
      contentHash = String(req.params.hash).replace(/\.mp3$/, "");
    if (!/^[a-f0-9]{64}$/.test(contentHash))
      fail(400, "VALIDATION_ERROR", "The audio id is invalid.");
    const asset = store.get<AudioAsset>(
      "voiceAudio",
      hash([p.companyId, p.personId, contentHash]),
      p,
      true,
    );
    if (!existsSync(asset.file))
      fail(404, "NOT_FOUND", "Prepare this voice line again.");
    res.setHeader("Cache-Control", "private, no-store");
    res.type("audio/mpeg").send(readFileSync(asset.file));
  });

  // Grants are intentionally not persisted by commands(): replay binds the same body,
  // then mints a replacement short-lived grant. Only a fingerprint is retained.
  router.post("/requests/:id/live-transcription", async (req, res) => {
    const p = onlyParticipant(res),
      id = String(req.params.id),
      key = requireKey(req);
    z.object({})
      .strict()
      .parse(req.body ?? {});
    const questions = questionContext(id, p);
    const replayId = hash([p.sessionId, id, key]),
      fingerprint = hash(req.body ?? {});
    const old = store.records.grantRequests?.[replayId]?.value as
      { hash: string } | undefined;
    if (old && old.hash !== fingerprint)
      fail(
        409,
        "IDEMPOTENCY_CONFLICT",
        "That key belongs to a different request.",
      );
    try {
      limit(`live:${p.companyId}:${id}`, 12, 86400000);
      limit(`live:${p.companyId}`, 400, 86400000);
    } catch {
      res.json({ available: false, reason: "LIVE_TRANSCRIPTION_LIMIT" });
      return;
    }
    store.put(
      "grantRequests",
      replayId,
      { hash: fingerprint },
      p.companyId,
      p.personId,
    );
    res.setHeader("Cache-Control", "no-store");
    res.json(
      await providers.liveTranscription.mint({
        keywords: [
          "Larkspur Supply",
          ...questions.flatMap((question) =>
            (question.hints ?? []).map((hint) => hint.label),
          ),
        ],
      }),
    );
  });
  router.post("/requests/:id/coverage", async (req, res) => {
    const p = onlyParticipant(res),
      questions = questionContext(String(req.params.id), p),
      body = answerCoverageBody.parse(req.body);
    const question = questions.find(
      (question) => question.key === body.questionKey,
    );
    if (!question)
      fail(400, "VALIDATION_ERROR", "That question is not in this request.");
    const covered = coverLocally(body.text, question.hints ?? []).covered;
    const hint = question.hints?.find((hint) => !covered.includes(hint.id));
    let followUp: { text: string; hintId: string } | undefined;
    if (
      config.followUps === "ai" &&
      hint &&
      !/\b(safety|harassment|legal|personal performance|don.t know|not sure|rather not|someone else)\b/i.test(
        body.text,
      )
    ) {
      try {
        rate(p, "followup");
        const prompt =
          "Ask one short follow-up about the supplied missing hint only. At most 20 words. Never repeat covered hints. Do not introduce names. Respect unknown and declined answers. " +
          dataBlock({
            question: question.text,
            missingHint: hint.label,
            answer: body.text,
            covered,
          });
        const result = await providers.conversation.turn({
          trigger: "slot_empty",
          prompt,
        });
        const words = result.text.trim().split(/\s+/);
        const hintWords = hint.label.toLowerCase().match(/[a-z]{3,}/g) ?? [];
        const known = new Set(
          (
            body.text +
            " " +
            question.text +
            " " +
            hint.label +
            " " +
            store
              .list<Person>("people", p)
              .map((person) => person.name)
              .join(" ")
          ).match(/\b[A-Z][a-z]+\b/g) ?? [],
        );
        const ordinaryStarts = new Set([
          "Who",
          "What",
          "Which",
          "How",
          "When",
          "Where",
          "Why",
          "Could",
          "Can",
          "Is",
          "Do",
          "Does",
          "Are",
          "Please",
          "Tell",
        ]);
        const names = words
          .map((word) => word.replace(/[^A-Za-z]/g, ""))
          .filter(
            (word, index) =>
              /^[A-Z][a-z]+$/.test(word) &&
              !(index === 0 && ordinaryStarts.has(word)),
          );
        const asksCovered = question.hints?.some(
          (item) =>
            covered.includes(item.id) &&
            result.text.toLowerCase().includes(item.label.toLowerCase()),
        );
        if (
          words.length <= 20 &&
          (result.text.match(/\?/g)?.length ?? 0) <= 1 &&
          hintWords.some((word) => result.text.toLowerCase().includes(word)) &&
          names.every((name) => known.has(name)) &&
          !asksCovered
        )
          followUp = { text: result.text, hintId: hint.id };
      } catch {
        /* Safe table nudge remains available on the client. */
      }
    }
    res.json({ available: true, covered, ...(followUp ? { followUp } : {}) });
  });
  router.post(
    "/task-cards/:id/decision",
    cmd((req, res) => {
      const p = onlyParticipant(res),
        id = String(req.params.id),
        card = store.get<Schemas["TaskCardView"]>("tasks", id, p, true);
      const body = z
        .object({
          decision: z.enum(["needs_change", "not_mine", "unsure"]),
          note: z.string().max(1000).optional(),
          recordVersion: z.number().int().positive(),
          contentHash: z.string().regex(/^[a-f0-9]{64}$/),
        })
        .strict()
        .parse(req.body);
      checkVersion(card, body.recordVersion, body.contentHash);
      store.put(
        "taskDecisions",
        hash([id, p.personId, body.recordVersion]),
        { ...body, taskCardId: id, decidedAt: new Date().toISOString() },
        p.companyId,
        p.personId,
      );
      store.put(
        "tasks",
        id,
        { ...card, reviewed: true, needsAttestation: false },
        p.companyId,
        p.personId,
      );
      return {
        body: {
          ok: true,
          acknowledged: true,
          taskCardId: id,
          version: card.version,
          hash: card.hash,
          decision: body.decision,
          taskUnchanged: true,
          checkReturned: store
            .list<Schemas["TaskCardView"]>("tasks", p, true)
            .every((task) => task.reviewed),
        },
      };
    }),
  );

  function pulseView(id: string, p: Principal) {
    const { pulse, own } = ownPulse(id, p);
    return {
      id,
      requestId: `pulse:${id}`,
      title: pulse.title,
      dueAt: pulse.dueAt,
      estimateMinutes: pulse.estimateMinutes,
      version: 1,
      contentHash: hash(own.questions),
      state: own.state,
      questions: own.questions.filter((question) => !question.isElse),
      advisorName: "Alex Moreno",
      companyName: "Larkspur Supply",
      teamStatusVisible: true,
    };
  }
  router.get("/pulses", (_req, res) => {
    const p = onlyParticipant(res);
    res.json({
      pulses: store
        .list<Pulse>("pulses", p)
        .filter((pulse) =>
          pulse.perPerson.some((person) => person.personId === p.personId),
        )
        .map((pulse) => pulseView(pulse.id, p)),
    });
  });
  router.get("/pulses/:id", (req, res) =>
    res.json(pulseView(String(req.params.id), onlyParticipant(res))),
  );
  router.get("/pulses/:id/team-status", (req, res) => {
    const p = onlyParticipant(res),
      { pulse } = ownPulse(String(req.params.id), p);
    const names = Object.fromEntries(
      store.list<Person>("people", p).map((person) => [person.id, person.name]),
    );
    res.json(pulseTeamStatus(pulse, names));
  });
  router.post(
    "/pulses/:id/responses",
    cmd((req, res) => {
      const p = onlyParticipant(res),
        id = String(req.params.id),
        { pulse, own } = ownPulse(id, p),
        body = mobileSubmitBody.parse(req.body);
      checkVersion(pulseView(id, p), body.expectedVersion, body.contentHash);
      if (own.state === "complete")
        fail(409, "REQUEST_CLOSED", "This Pulse has already been sent.");
      if (body.understanding !== null)
        fail(
          400,
          "VALIDATION_ERROR",
          "Review and send your own Pulse answers.",
        );
      const keys = new Set(own.questions.map((question) => question.key));
      keys.add(
        `question.${own.questions.filter((question) => !question.isElse).length}`,
      );
      for (const map of [
        body.questionAnswers,
        body.questionUnderstood,
        body.questionSuggestions,
        body.questionResponses,
        body.questionAnswerSources,
      ])
        if (
          map &&
          Object.keys(map).some((key) => !keys.has(key as `question.${number}`))
        )
          fail(
            400,
            "VALIDATION_ERROR",
            "One answer does not belong to this Pulse.",
          );
      if (body.audioAssetId) store.get("assets", body.audioAssetId, p, true);
      if (body.transcriptJobId)
        store.get("jobs", body.transcriptJobId, p, true);
      const responseId = uuid();
      store.put(
        "pulseResponses",
        responseId,
        { ...body, pulseId: id, personId: p.personId },
        p.companyId,
        p.personId,
      );
      own.state = "complete";
      store.put("pulses", id, pulse, p.companyId);
      if (
        pulse.meetingId &&
        pulse.perPerson.every((person) => person.state === "complete")
      ) {
        const meeting = store.get<MeetingDefinition>(
          "meetings",
          pulse.meetingId,
          p,
        );
        const responses = store
          .list<{
            pulseId: string;
            text: string;
            questionResponses?: Record<string, string>;
          }>("pulseResponses", p)
          .filter((response) => response.pulseId === id);
        const unresolved = responses.some(
          (response) =>
            Object.keys(response.questionResponses ?? {}).length > 0 ||
            /\b(blocked|unresolved|contradiction|cannot|don.t know|not sure)\b/i.test(
              response.text,
            ),
        );
        const purelyAsync =
          meeting.agenda.every((topic) => topic.async) ||
          ["INFORMATIONAL", "INSTRUCTIONAL"].includes(
            meeting.meetingType ?? "",
          );
        const remaining = purelyAsync
          ? meeting
          : {
              ...meeting,
              agenda: meeting.agenda.filter((topic) => !topic.async),
            };
        const gate = gateMeeting(remaining, {
          allSatisfied: purelyAsync && !unresolved,
          contradiction: unresolved,
        });
        store.put(
          "meetings",
          meeting.id,
          version(
            {
              ...meeting,
              gate,
              state: "ROUTED",
              updatedAt: new Date().toISOString(),
            },
            meeting.version + 1,
          ),
          p.companyId,
        );
      }
      return {
        body: {
          responseId,
          requestId: `pulse:${id}`,
          requestState: "returned",
          version: 2,
          idempotentReplay: false,
          reconciliation: { state: "not_requested" },
          reviewState: "words_unreviewed",
        },
      };
    }),
  );

  function ownProposals(meeting: MeetingDefinition, p: Principal) {
    const sessions = store
      .list<MeetingSession>("sessions", p)
      .filter((session) => session.meetingId === meeting.id);
    return store.list<MeetingProposal>("proposals", p).filter((proposal) => {
      const session = sessions.find(
        (session) => session.id === proposal.sessionId,
      );
      if (
        !session ||
        session.consents.some(
          (consent) =>
            consent.personKey === p.personId && consent.state === "declined",
        )
      )
        return false;
      if (proposal.body.kind === "action")
        return proposal.body.ownerPersonKey === p.personId;
      if (proposal.body.kind === "responsibility_delta")
        return proposal.body.personKey === p.personId;
      if (proposal.body.kind === "open_question")
        return proposal.body.askPersonKey === p.personId;
      const map = store.records.speakers?.[session.id]?.value as
        SpeakerMap | undefined;
      return proposal.sources.some(
        (source) =>
          source.personKey === p.personId ||
          map?.entries.some(
            (entry) =>
              entry.cluster === source.speakerCluster &&
              entry.confirmedBy &&
              entry.personKey === p.personId,
          ),
      );
    });
  }
  function detail(meeting: MeetingDefinition, p: Principal): MeetingDetail {
    const released =
      meeting.gate?.releasedPersonIds.includes(p.personId) ||
      meeting.gate?.mode === "NO_MEETING" ||
      meeting.gate?.mode === "ASYNC";
    const plannedMinutes = released
      ? 0
      : meeting.routeChoice === "as_planned"
        ? meeting.minutes
        : (meeting.gate?.liveMinutes ?? meeting.minutes);
    const completed = [
      "REVIEW_PENDING",
      "APPROVED",
      "PARTIALLY_APPROVED",
      "COMPLETE",
    ].includes(meeting.state);
    const outcome: MeetingDetail["outcome"] = completed
      ? "COMPLETED"
      : released
        ? "AVOIDED"
        : plannedMinutes < meeting.minutes
          ? "SHORTENED"
          : meeting.gate
            ? "REQUIRED"
            : "PENDING";
    const person = meeting.attendees.find(
      (attendee) => attendee.personId === p.personId,
    );
    return {
      id: meeting.id,
      title: meeting.title,
      outcome,
      ...(meeting.startsAt
        ? {
            startsAt: meeting.startsAt,
            endsAt: new Date(
              Date.parse(meeting.startsAt) + plannedMinutes * 60000,
            ).toISOString(),
          }
        : {}),
      originalDurationMinutes: meeting.minutes,
      newDurationMinutes: plannedMinutes,
      minutesReturned: Math.max(0, meeting.minutes - plannedMinutes),
      headline: completed
        ? "Check the items about your work."
        : released
          ? "You no longer need to join this meeting."
          : plannedMinutes < meeting.minutes
            ? `Your meeting is now ${plannedMinutes} minutes.`
            : "Your input is needed live.",
      reason: meeting.gate?.reason ?? "The leader is planning this meeting.",
      purpose: meeting.power.purpose,
      expectedOutcome: meeting.power.outcomes.join("; "),
      whyYou: "Your input is needed for the topics assigned to you.",
      yourRole:
        person?.roles.map((role) => role.replaceAll("_", " ")).join(", ") ?? "",
      hasBrief: true,
      hasWrapUp: ownProposals(meeting, p).length > 0,
    };
  }
  router.get("/meetings", (_req, res) => {
    const p = onlyParticipant(res);
    const meetings: MeetingSummary[] = store
      .list<MeetingDefinition>("meetings", p)
      .filter((meeting) =>
        meeting.attendees.some((attendee) => attendee.personId === p.personId),
      )
      .map((meeting) => {
        const view = detail(meeting, p);
        const suffix =
          view.outcome === "AVOIDED"
            ? "avoided"
            : view.outcome === "SHORTENED"
              ? "shortened"
              : "required";
        return {
          id: meeting.id,
          title: meeting.title,
          group:
            view.outcome === "COMPLETED"
              ? "RECENT"
              : view.outcome === "AVOIDED"
                ? "ASYNC"
                : "UPCOMING",
          whenLabel: meeting.startsAt ?? "Time to be confirmed",
          ...(meeting.startsAt ? { startsAt: meeting.startsAt } : {}),
          outcome: view.outcome,
          statusLine: view.headline,
          tone:
            view.outcome === "AVOIDED"
              ? "sage"
              : view.outcome === "SHORTENED"
                ? "amber"
                : "plain",
          route: `/meetings/${meeting.id}/${suffix}`,
        };
      });
    res.json({ meetings });
  });
  router.get("/meetings/:id", (req, res) => {
    const p = onlyParticipant(res);
    res.json(detail(ownMeeting(String(req.params.id), p), p));
  });
  router.get("/meetings/:id/brief", (req, res) => {
    const p = onlyParticipant(res),
      meeting = ownMeeting(String(req.params.id), p),
      view = detail(meeting, p);
    const questions = meeting.agenda
      .filter((topic) => topic.forPersonIds.includes(p.personId))
      .flatMap((topic) => topic.questions);
    const brief: MeetingBrief = {
      meetingId: meeting.id,
      title: meeting.title,
      whenLabel: meeting.startsAt ?? "Time to be confirmed",
      durationMinutes: view.newDurationMinutes ?? meeting.minutes,
      purpose: meeting.power.purpose,
      expectedOutcome: meeting.power.outcomes.join("; "),
      whyYou: view.whyYou ?? "",
      alreadyKnown: [],
      openQuestions: questions,
      mayAskYou: questions,
    };
    res.json(brief);
  });
  function confirmation(meeting: MeetingDefinition, p: Principal) {
    return {
      id: meeting.id,
      meetingId: meeting.id,
      title: meeting.title,
      items: ownProposals(meeting, p).map((proposal) => {
        const closing = store.records.closing?.[proposal.sessionId]?.value as
          ClosingItem[] | undefined;
        const item = closing?.find((item) => item.proposalId === proposal.id);
        return {
          id: proposal.id,
          proposalId: proposal.id,
          kind: proposal.kind,
          text: textBody(proposal),
          version: proposal.version,
          hash: proposal.hash,
          confirmation: item?.confirmation ?? "pending",
          ...(item?.note ? { note: item.note } : {}),
        };
      }),
    };
  }
  router.get("/confirmations", (_req, res) => {
    const p = onlyParticipant(res);
    res.json({
      confirmations: store
        .list<MeetingDefinition>("meetings", p)
        .filter((meeting) =>
          meeting.attendees.some((person) => person.personId === p.personId),
        )
        .map((meeting) => confirmation(meeting, p))
        .filter((view) => view.items.length)
        .map((view) => ({
          id: view.id,
          meetingId: view.meetingId,
          title: view.title,
          itemCount: view.items.length,
          complete: view.items.every((item) => item.confirmation !== "pending"),
        })),
    });
  });
  router.get("/confirmations/:id", (req, res) => {
    const p = onlyParticipant(res);
    res.json(confirmation(ownMeeting(String(req.params.id), p), p));
  });
  router.post(
    "/confirmations/:id/items/:itemId",
    cmd((req, res) => {
      const p = onlyParticipant(res),
        meeting = ownMeeting(String(req.params.id), p),
        id = String(req.params.itemId);
      const proposal = ownProposals(meeting, p).find(
        (proposal) => proposal.id === id,
      );
      if (!proposal)
        fail(403, "PERSON_FORBIDDEN", "This item is not about your work.");
      const body = z
        .object({
          decision: z.enum(["confirm", "change", "not_mine"]),
          note: z.string().trim().max(2000).optional(),
          expectedVersion: z.number().int().positive(),
          contentHash: z.string().regex(/^[a-f0-9]{64}$/),
        })
        .strict()
        .parse(req.body);
      checkVersion(proposal, body.expectedVersion, body.contentHash);
      if (proposal.state === "stale")
        fail(
          409,
          "EVIDENCE_REQUIRED",
          "The source changed. Ask the leader to review it first.",
        );
      if (body.decision === "change" && !body.note)
        fail(400, "VALIDATION_ERROR", "Explain the change in a short note.");
      if (proposal.body.kind === "action") {
        if (body.decision === "confirm") proposal.body.status = "assigned";
        else {
          proposal.body.status = "proposed";
          if (body.decision === "not_mine") proposal.body.ownerPersonKey = null;
        }
      }
      if (body.decision !== "confirm") {
        proposal.state = "proposed";
        proposal.editNote =
          body.note ?? "The participant says this is not their work.";
      }
      store.put(
        "proposals",
        id,
        version(proposal, proposal.version + 1),
        p.companyId,
      );
      const closing =
        (store.records.closing?.[proposal.sessionId]?.value as
          ClosingItem[] | undefined) ?? [];
      const item: ClosingItem = {
        proposalId: id,
        ownerPersonKey: p.personId,
        confirmation:
          body.decision === "confirm"
            ? "confirmed"
            : body.decision === "change"
              ? "changed"
              : "not_mine",
        ...(body.note ? { note: body.note } : {}),
      };
      store.put(
        "closing",
        proposal.sessionId,
        [...closing.filter((existing) => existing.proposalId !== id), item],
        p.companyId,
      );
      return { body: { acknowledged: true, item } };
    }),
  );
  return router;
}
