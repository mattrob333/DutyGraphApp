import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import { once } from "node:events";
import { Store, IDS, issue, errors, uuid, hash, version } from "../src/core.ts";
import { seed } from "../src/participant.ts";
import { seedPeople } from "../src/meetings.ts";
import { configFromEnv } from "../src/config.ts";
import { createProviders } from "../src/providers/index.ts";
import { v1xRoutes } from "../src/v1x.ts";
import { buildQuestions } from "../../shared/hands-free/hints.ts";
import type {
  MeetingDefinition,
  Pulse,
  MeetingSession,
  MeetingProposal,
} from "../../shared/meetings/types.ts";

async function fixture(
  t: TestContext,
  options: { live?: boolean; ai?: boolean } = {},
) {
  const dir = mkdtempSync(join(tmpdir(), "dutygraph-v1x-"));
  const store = new Store(join(dir, "data.json"));
  seed(store);
  seedPeople(store);
  const participant = issue(
    store,
    { companyId: IDS.company, personId: IDS.participant },
    "participant_mobile",
  );
  const colleague = issue(
    store,
    { companyId: IDS.company, personId: IDS.priya },
    "participant_mobile",
  );
  const outsider = issue(
    store,
    { companyId: IDS.otherCompany, personId: IDS.participant },
    "participant_mobile",
  );
  const advisor = issue(
    store,
    { companyId: IDS.company, personId: IDS.advisor },
    "advisor_mobile",
  );
  const config = configFromEnv({
    DEV_SERVER_AUDIO_DIR: join(dir, "audio"),
    FAKE_LIVE_TRANSCRIPTION: options.live ? "1" : "",
    FEATURE_FOLLOW_UPS: options.ai ? "ai" : "table",
  });
  const providers = createProviders(config.providers, async () => {
    throw new Error("Network forbidden");
  });
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => {
    res.locals.requestId = uuid();
    next();
  });
  app.use("/api/mobile/v1x", v1xRoutes(store, providers, config));
  app.use(errors);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/api/mobile/v1x`;
  t.after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(dir, { recursive: true, force: true });
  });
  async function call(
    path: string,
    method = "GET",
    body?: unknown,
    token = participant.accessToken,
    key?: string,
  ) {
    const response = await fetch(base + path, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const json = response.headers.get("content-type")?.includes("json")
      ? await response.json()
      : await response.arrayBuffer();
    return { status: response.status, body: json, headers: response.headers };
  }
  const meeting: MeetingDefinition = version({
    id: uuid(),
    companyId: IDS.company,
    title: "Weekly operations update",
    startsAt: null,
    minutes: 30,
    power: {
      purpose: "Share known status",
      outcomes: ["Status known"],
      execution: "Share updates",
    },
    attendees: [
      { personId: IDS.participant, name: "Noah Reed", roles: ["resource"] },
      { personId: IDS.priya, name: "Priya Shah", roles: ["resource"] },
    ],
    meetingType: "INFORMATIONAL",
    secondaryPhases: [],
    agenda: [
      {
        id: "topic-1",
        title: "Status",
        minutes: 30,
        forPersonIds: [IDS.participant, IDS.priya],
        questions: ["What changed?"],
        outcomeIds: ["outcome-1"],
        async: true,
      },
    ],
    gate: null,
    routeChoice: null,
    state: "PREPARING",
    createdBy: IDS.advisor,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  store.put("meetings", meeting.id, meeting, IDS.company);
  const pulse: Pulse = {
    id: uuid(),
    meetingId: meeting.id,
    title: "Operations Pulse",
    dueAt: "2030-01-01T00:00:00.000Z",
    estimateMinutes: 2,
    perPerson: [
      {
        personId: IDS.participant,
        questions: buildQuestions(["What changed in shipping?"]),
        state: "not_started",
      },
      {
        personId: IDS.priya,
        questions: buildQuestions(["What changed in the carrier API?"]),
        state: "not_started",
      },
    ],
  };
  store.put("pulses", pulse.id, pulse, IDS.company);
  return {
    store,
    providers,
    config,
    call,
    participant,
    colleague,
    outsider,
    advisor,
    meeting,
    pulse,
    dir,
  };
}
function submission(
  dto: { contentHash: string; version: number },
  text = "The work is complete.",
) {
  return {
    expectedVersion: dto.version,
    contentHash: dto.contentHash,
    participantConfirmed: true,
    text,
    source: "typed",
    understanding: null,
    understandingUnavailable: true,
    questionAnswers: { "question.0": text },
    attestation: { requestContentHash: dto.contentHash },
  };
}

test("config, Pulse list and meeting DTOs remain authenticated and participant scoped", async (t) => {
  const f = await fixture(t);
  assert.equal((await f.call("/config", "GET", undefined, "")).status, 401);
  assert.equal((await f.call("/config")).body.autoAdvance, false);
  const list = await f.call("/pulses");
  assert.equal(list.body.pulses.length, 1);
  assert.equal(list.body.pulses[0].questions.length, 1);
  assert.equal(JSON.stringify(list.body).includes("carrier API"), false);
  assert.equal(
    (
      await f.call(
        `/pulses/${f.pulse.id}`,
        "GET",
        undefined,
        f.outsider.accessToken,
      )
    ).status,
    403,
  );
  assert.equal(
    (await f.call("/pulses", "GET", undefined, f.advisor.accessToken)).status,
    403,
  );
  const meetings = await f.call("/meetings");
  assert.equal(meetings.body.meetings.length, 1);
  f.store.put(
    "meetings",
    f.meeting.id,
    {
      ...f.meeting,
      gate: {
        mode: "LIVE",
        route: "LIVE",
        reason: "Internal confidence 0.99; evidence score 7",
        requiredPersonIds: [IDS.participant],
        releasedPersonIds: [],
        liveMinutes: 30,
        asyncTopicIds: [],
        judgedBy: "model",
      },
    },
    IDS.company,
  );
  const detail = await f.call(`/meetings/${f.meeting.id}`);
  assert.equal(detail.body.title, f.meeting.title);
  assert.equal("attendees" in detail.body, false);
  assert.equal("gate" in detail.body, false);
  assert.equal(
    /confidence|score|0\.99/.test(JSON.stringify(detail.body)),
    false,
  );
  assert.equal(
    (
      await f.call(
        `/meetings/${f.meeting.id}/brief`,
        "GET",
        undefined,
        f.outsider.accessToken,
      )
    ).status,
    403,
  );
});

test("TTS commands cache private audio, deduplicate retries and never persist words", async (t) => {
  const f = await fixture(t);
  let calls = 0;
  const original = f.providers.tts.synthesize;
  f.providers.tts.synthesize = async (input) => {
    calls++;
    return original(input);
  };
  const input = {
    requestId: IDS.request,
    lines: [{ id: "q0", text: "Who owns the confidential delivery queue?" }],
  };
  assert.equal((await f.call("/voice/lines", "POST", input)).status, 400);
  const first = await f.call(
    "/voice/lines",
    "POST",
    input,
    f.participant.accessToken,
    "speech-1",
  );
  assert.equal(first.status, 200);
  assert.equal(calls, 1);
  assert.deepEqual(
    (
      await f.call(
        "/voice/lines",
        "POST",
        input,
        f.participant.accessToken,
        "speech-1",
      )
    ).body,
    first.body,
  );
  assert.equal(
    (
      await f.call(
        "/voice/lines",
        "POST",
        { ...input, speed: 1.1 },
        f.participant.accessToken,
        "speech-1",
      )
    ).status,
    409,
  );
  await f.call(
    "/voice/lines",
    "POST",
    input,
    f.participant.accessToken,
    "speech-2",
  );
  assert.equal(calls, 1);
  const path = first.body.lines[0].url.replace("/api/mobile/v1x", "");
  assert.equal((await f.call(path)).status, 200);
  assert.equal((await f.call(path, "GET", undefined, "")).status, 401);
  assert.equal(
    (await f.call(path, "GET", undefined, f.colleague.accessToken)).status,
    404,
  );
  assert.equal(
    (await f.call(path, "GET", undefined, f.outsider.accessToken)).status,
    404,
  );
  assert.equal(
    readFileSync(join(f.dir, "data.json"), "utf8").includes(
      input.lines[0].text,
    ),
    false,
  );
});

test("live grants support Pulse context and never enter persistent idempotency results", async (t) => {
  const f = await fixture(t, { live: true });
  const path = `/requests/pulse:${f.pulse.id}/live-transcription`;
  assert.equal((await f.call(path, "POST", {})).status, 400);
  const first = await f.call(
    path,
    "POST",
    {},
    f.participant.accessToken,
    "grant-1",
  );
  const second = await f.call(
    path,
    "POST",
    {},
    f.participant.accessToken,
    "grant-1",
  );
  assert.equal(first.body.available, true);
  assert.notEqual(first.body.clientSecret, second.body.clientSecret);
  assert.equal(
    readFileSync(join(f.dir, "data.json"), "utf8").includes(
      first.body.clientSecret,
    ),
    false,
  );
  assert.equal(first.headers.get("cache-control"), "no-store");
  for (let i = 0; i < 10; i++)
    await f.call(path, "POST", {}, f.participant.accessToken, `grant-${i + 2}`);
  assert.equal(
    (await f.call(path, "POST", {}, f.participant.accessToken, "grant-over"))
      .body.reason,
    "LIVE_TRANSCRIPTION_LIMIT",
  );
});

test("Task Card decisions require exact version, preserve content, and reject other people", async (t) => {
  const f = await fixture(t),
    record = f.store.records.tasks![IDS.task]!.value as {
      version: number;
      hash: string;
      data: unknown;
    };
  const body = {
    decision: "needs_change",
    recordVersion: record.version,
    contentHash: record.hash,
    note: "The handoff changed.",
  };
  assert.equal(
    (
      await f.call(
        `/task-cards/${IDS.task}/decision`,
        "POST",
        body,
        f.colleague.accessToken,
        "task-1",
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await f.call(
        `/task-cards/${IDS.task}/decision`,
        "POST",
        { ...body, recordVersion: 2 },
        f.participant.accessToken,
        "task-2",
      )
    ).status,
    409,
  );
  const done = await f.call(
    `/task-cards/${IDS.task}/decision`,
    "POST",
    body,
    f.participant.accessToken,
    "task-1",
  );
  assert.equal(done.status, 200);
  assert.equal(done.body.taskUnchanged, true);
  assert.deepEqual(
    (f.store.records.tasks![IDS.task]!.value as typeof record).data,
    record.data,
  );
});

test("Pulse submits are idempotent, private, and second gate runs only after everyone submits", async (t) => {
  const f = await fixture(t);
  const mine = (await f.call(`/pulses/${f.pulse.id}`)).body;
  const theirs = (
    await f.call(
      `/pulses/${f.pulse.id}`,
      "GET",
      undefined,
      f.colleague.accessToken,
    )
  ).body;
  const body = submission(
    mine,
    "Shipping work is complete; private participant words.",
  );
  const first = await f.call(
    `/pulses/${f.pulse.id}/responses`,
    "POST",
    body,
    f.participant.accessToken,
    "pulse-1",
  );
  assert.equal(first.status, 200);
  const replay = await f.call(
    `/pulses/${f.pulse.id}/responses`,
    "POST",
    body,
    f.participant.accessToken,
    "pulse-1",
  );
  assert.equal(replay.body.responseId, first.body.responseId);
  assert.equal(replay.body.idempotentReplay, true);
  assert.equal(Object.keys(f.store.records.pulseResponses!).length, 1);
  const team = await f.call(`/pulses/${f.pulse.id}/team-status`);
  assert.equal(team.body.done, 1);
  assert.equal(JSON.stringify(team.body).includes("private"), false);
  assert.equal(JSON.stringify(team.body).includes("questions"), false);
  assert.equal(
    (f.store.records.meetings![f.meeting.id]!.value as MeetingDefinition).gate,
    null,
  );
  assert.equal(
    (
      await f.call(
        `/pulses/${f.pulse.id}/responses`,
        "POST",
        submission(theirs),
        f.colleague.accessToken,
        "pulse-2",
      )
    ).status,
    200,
  );
  assert.equal(
    (f.store.records.meetings![f.meeting.id]!.value as MeetingDefinition).gate
      ?.mode,
    "NO_MEETING",
  );
});

test("coverage accepts a bounded follow-up about an uncovered hint and suppresses overlong output", async (t) => {
  const f = await fixture(t, { ai: true });
  const request = f.store.records.requests![IDS.request]!.value as {
    questions: {
      key: string;
      text: string;
      hints: { id: string; label: string; nudge: string; cues: string[] }[];
    }[];
  };
  request.questions[0]!.hints = [
    { id: "h0", label: "Tools", nudge: "Which tools?", cues: ["tool"] },
  ];
  f.providers.conversation.turn = async () => ({
    text: "Which tools do you use?",
    action: "ASK_FOLLOW_UP",
  });
  const response = await f.call(`/requests/${IDS.request}/coverage`, "POST", {
    questionKey: "question.0",
    text: "I work each day.",
  });
  assert.deepEqual(response.body.followUp, {
    text: "Which tools do you use?",
    hintId: "h0",
  });
  f.providers.conversation.turn = async () => ({
    text: "tools ".repeat(21),
    action: "ASK_FOLLOW_UP",
  });
  assert.equal(
    (
      await f.call(`/requests/${IDS.request}/coverage`, "POST", {
        questionKey: "question.0",
        text: "I work each day.",
      })
    ).body.followUp,
    undefined,
  );
  assert.equal(
    (
      await f.call(`/requests/${IDS.request}/coverage`, "POST", {
        questionKey: "question.0",
        text: "My tools are ready.",
      })
    ).body.followUp,
    undefined,
  );
});

test("wrap-up exposes only own items and owner confirmation controls assignment", async (t) => {
  const f = await fixture(t),
    sessionId = uuid();
  f.store.put(
    "sessions",
    sessionId,
    {
      id: sessionId,
      meetingId: f.meeting.id,
      consents: [
        { personKey: IDS.participant, state: "consented" },
        { personKey: IDS.priya, state: "consented" },
      ],
    } as MeetingSession,
    IDS.company,
  );
  const proposal: MeetingProposal = version({
    id: uuid(),
    sessionId,
    kind: "action",
    state: "proposed",
    sources: [
      {
        segmentId: uuid(),
        revision: 1,
        quote: "I will check the queue.",
        speakerCluster: "S1",
        personKey: IDS.participant,
      },
    ],
    evidence: "observed",
    body: {
      kind: "action",
      what: "Check the queue",
      ownerPersonKey: IDS.participant,
      due: null,
      dependsOn: [],
      doneWhen: "Queue checked",
      status: "proposed",
    },
    decidedBy: null,
    decidedAt: null,
  });
  f.store.put("proposals", proposal.id, proposal, IDS.company);
  f.store.put(
    "proposals",
    "other-action",
    version({
      ...proposal,
      id: "other-action",
      body: {
        ...proposal.body,
        ownerPersonKey: IDS.priya,
        what: "Private colleague action",
      },
    }),
    IDS.company,
  );
  const own = await f.call(`/confirmations/${f.meeting.id}`);
  assert.equal(own.body.items.length, 1);
  assert.equal(JSON.stringify(own.body).includes("Private colleague"), false);
  const body = {
    decision: "confirm",
    expectedVersion: proposal.version,
    contentHash: proposal.hash,
  };
  assert.equal(
    (
      await f.call(
        `/confirmations/${f.meeting.id}/items/${proposal.id}`,
        "POST",
        body,
        f.colleague.accessToken,
        "confirm-foreign",
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await f.call(
        `/confirmations/${f.meeting.id}/items/${proposal.id}`,
        "POST",
        body,
        f.participant.accessToken,
        "confirm-own",
      )
    ).status,
    200,
  );
  const updated = f.store.records.proposals![proposal.id]!
    .value as MeetingProposal;
  assert.ok(updated.body.kind === "action");
  assert.equal(updated.body.status, "assigned");
  assert.equal(updated.state, "proposed");
  assert.equal(
    (await f.call("/confirmations")).body.confirmations[0].complete,
    true,
  );
});

test("follow-up refuses invented names and sensitive probes; rate exhaustion falls back without failing coverage", async (t) => {
  const f = await fixture(t, { ai: true });
  const request = f.store.records.requests![IDS.request]!.value as {
    questions: {
      hints: { id: string; label: string; nudge: string; cues: string[] }[];
    }[];
  };
  request.questions[0]!.hints = [
    { id: "h0", label: "Tools", nudge: "Which tools?", cues: ["tool"] },
  ];
  let calls = 0;
  f.providers.conversation.turn = async () => {
    calls++;
    return { text: "Evelyn, which tools do you use?", action: "ASK_FOLLOW_UP" };
  };
  const path = `/requests/${IDS.request}/coverage`;
  for (const text of [
    "I have a safety concern.",
    "I don't know.",
    "I would rather not.",
  ]) {
    const response = await f.call(path, "POST", {
      questionKey: "question.0",
      text,
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.followUp, undefined);
  }
  assert.equal(calls, 0);
  for (let i = 0; i < 35; i++) {
    const response = await f.call(path, "POST", {
      questionKey: "question.0",
      text: "I work each day.",
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.available, true);
    assert.equal(response.body.followUp, undefined);
  }
  assert.equal(calls, 30);
});
