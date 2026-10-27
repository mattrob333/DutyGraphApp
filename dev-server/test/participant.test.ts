import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createApp } from "../src/index.ts";
import { DEV_INVITATION } from "../src/participant.ts";
import { IDS, Store, digest } from "../src/core.ts";
export async function fixture() {
  const context = createApp();
  const server = createServer(context.app).listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
  const call = async (
    path: string,
    body?: unknown,
    token?: string,
    key?: string,
    method?: string,
  ) => {
    const res = await fetch(base + path, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: res.status,
      body: res.status === 204 ? null : await res.json(),
    };
  };
  return {
    ...context,
    base,
    call,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}
test("participant contract flow, hints, validation and idempotent submit", async () => {
  const f = await fixture();
  try {
    const missing = await f.call("/api/mobile/v1/enroll", {
      invitationToken: DEV_INVITATION,
    });
    assert.equal(missing.body.code, "IDEMPOTENCY_REQUIRED");
    assert.equal(typeof missing.body.requestId, "string");
    const session = await f.call(
      "/api/mobile/v1/enroll",
      { invitationToken: DEV_INVITATION },
      undefined,
      "enroll",
    );
    assert.equal(session.status, 201);
    const token = session.body.accessToken;
    const d = (
      await f.call("/api/mobile/v1/requests/" + IDS.request, undefined, token)
    ).body;
    assert.equal(d.questions.length, 6);
    assert.ok(d.questions.every((q: { hints: unknown[] }) => q.hints.length));
    const body = {
      expectedVersion: d.version,
      contentHash: d.contentHash,
      participantConfirmed: true,
      text: "I check shipments.",
      source: "typed",
      understanding: null,
      understandingUnavailable: true,
      attestation: { requestContentHash: d.contentHash },
      questionAnswers: { "question.0": "I check shipments." },
    };
    const path = "/api/mobile/v1/requests/" + IDS.request + "/submit";
    const [a, b] = await Promise.all([
      f.call(path, body, token, "send"),
      f.call(path, body, token, "send"),
    ]);
    assert.equal(a.status, 200);
    assert.equal(a.body.responseId, b.body.responseId);
    assert.equal(Object.keys(f.store.records.responses).length, 1);
    assert.equal(
      (await f.call(path, { ...body, text: "Different" }, token, "send")).body
        .code,
      "IDEMPOTENCY_CONFLICT",
    );
    assert.equal(
      (await f.call(path, body, token)).body.code,
      "IDEMPOTENCY_REQUIRED",
    );
  } finally {
    await f.close();
  }
});
test("refresh rotates, bounded replay replaces pair, replay without key revokes family", async () => {
  const f = await fixture();
  try {
    const initial = (
      await f.call(
        "/api/mobile/v1/enroll",
        { invitationToken: DEV_INVITATION },
        undefined,
        "enroll",
      )
    ).body;
    const first = (
      await f.call(
        "/api/mobile/v1/session/refresh",
        { refreshToken: initial.refreshToken },
        undefined,
        "refresh",
      )
    ).body;
    assert.notEqual(first.refreshToken, initial.refreshToken);
    const replay = (
      await f.call(
        "/api/mobile/v1/session/refresh",
        { refreshToken: initial.refreshToken },
        undefined,
        "refresh",
      )
    ).body;
    assert.equal(replay.idempotentReplay, true);
    assert.notEqual(replay.refreshToken, first.refreshToken);
    assert.equal(
      (
        await f.call("/api/mobile/v1/session/refresh", {
          refreshToken: initial.refreshToken,
        })
      ).body.code,
      "REFRESH_REPLAY",
    );
    assert.equal(
      (await f.call("/api/mobile/v1/me", undefined, replay.accessToken)).status,
      401,
    );
    assert.ok(!JSON.stringify(f.store.sessions).includes(replay.accessToken));
  } finally {
    await f.close();
  }
});
test("scope prevents another person reading records", async () => {
  const f = await fixture();
  try {
    f.store.invitations[digest("e".repeat(64))] = {
      companyId: IDS.otherCompany,
      personId: IDS.marcus,
      expiresAt: Date.now() + 10000,
    };
    const s = (
      await f.call(
        "/api/mobile/v1/enroll",
        { invitationToken: "e".repeat(64) },
        undefined,
        "other",
      )
    ).body;
    assert.equal(
      (
        await f.call(
          "/api/mobile/v1/requests/" + IDS.request,
          undefined,
          s.accessToken,
        )
      ).status,
      403,
    );
  } finally {
    await f.close();
  }
});
test("proxy forwards bearer, bytes, status and upstream headers", async () => {
  const upstream = createServer(async (req, res) => {
    assert.equal(req.url, "/api/mobile/v1/requests?x=1");
    assert.equal(req.headers.authorization, "Bearer sample");
    let body = "";
    for await (const chunk of req) body += chunk;
    assert.equal(body, '{"a":1}');
    res.writeHead(202, {
      "content-type": "application/json",
      "x-proxy-test": "yes",
    });
    res.end('{"ok":true}');
  }).listen(0, "127.0.0.1");
  await once(upstream, "listening");
  const { app } = createApp({
    origin: `http://127.0.0.1:${(upstream.address() as import("node:net").AddressInfo).port}`,
  });
  const server = createServer(app).listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const r = await fetch(
      `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}/api/mobile/v1/requests?x=1`,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer sample",
          "Content-Type": "application/json",
        },
        body: '{"a":1}',
      },
    );
    assert.equal(r.status, 202);
    assert.equal(r.headers.get("x-proxy-test"), "yes");
    assert.deepEqual(await r.json(), { ok: true });
  } finally {
    server.close();
    upstream.close();
  }
});

test("participant reads, coverage, understanding, Task Card attestation and recorded clips follow the pinned API", async () => {
  const f = await fixture();
  try {
    const session = (
      await f.call(
        "/api/mobile/v1/enroll",
        { invitationToken: DEV_INVITATION },
        undefined,
        "enroll",
      )
    ).body;
    const token = session.accessToken;
    const me = await f.call("/api/mobile/v1/me", undefined, token);
    assert.equal(me.body.personId, IDS.participant);
    const list = await f.call("/api/mobile/v1/requests", undefined, token);
    assert.equal(list.body.requests[0].requestId, IDS.request);
    const d = (
      await f.call("/api/mobile/v1/requests/" + IDS.request, undefined, token)
    ).body;
    assert.equal(
      (
        await f.call(
          "/api/mobile/v1/requests/" + IDS.request + "/coverage",
          {
            questionKey: "question.0",
            text: "I check shipment orders each morning.",
          },
          token,
        )
      ).body.available,
      true,
    );
    assert.equal(
      (
        await f.call(
          "/api/mobile/v1/requests/" + IDS.request + "/coverage",
          { questionKey: "question.99", text: "No" },
          token,
        )
      ).status,
      400,
    );
    const understand = await f.call(
      "/api/mobile/v1/requests/" + IDS.request + "/understand",
      {
        answers: [
          {
            key: "question.0",
            question: "What work?",
            text: "I check shipments.",
          },
        ],
      },
      token,
    );
    assert.equal(understand.body.items[0].understood, "I check shipments.");
    assert.equal(
      (
        await f.call(
          "/api/mobile/v1/requests/" + IDS.request + "/understand",
          {
            answers: [
              { key: "question.999", question: "Other?", text: "Unasked" },
            ],
          },
          token,
        )
      ).status,
      400,
    );
    const task = (
      await f.call("/api/mobile/v1/task-cards/" + IDS.task, undefined, token)
    ).body;
    assert.equal(
      (await f.call("/api/mobile/v1/task-cards", undefined, token)).body
        .taskCards.length,
      3,
    );
    assert.equal(
      (
        await f.call(
          "/api/mobile/v1/task-cards/" + IDS.task + "/attest",
          {
            recordVersion: task.version,
            contentHash: task.hash,
            decision: "correct",
          },
          token,
          "attest",
        )
      ).body.taskUnchanged,
      true,
    );
    assert.equal(
      (
        await f.call(
          "/api/mobile/v1/task-cards/" + IDS.task + "/attest",
          {
            recordVersion: task.version,
            contentHash: task.hash,
            decision: "unsure",
          },
          token,
          "bad-choice",
        )
      ).body.code,
      "NOT_AVAILABLE",
    );
    const form = new FormData();
    form.append(
      "audio",
      new Blob([new Uint8Array([1, 2, 3, 4])], { type: "audio/aac" }),
      "clip.aac",
    );
    form.append(
      "meta",
      JSON.stringify({
        expectedVersion: d.version,
        contentHash: d.contentHash,
        consent: true,
      }),
    );
    const upload = await fetch(
      f.base + "/api/mobile/v1/requests/" + IDS.request + "/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": "clip",
        },
        body: form,
      },
    );
    const clip = await upload.json();
    assert.equal(upload.status, 200);
    assert.equal(clip.reviewRequired, true);
    const reuse = await f.call(
      "/api/mobile/v1/requests/" + IDS.request + "/transcriptions",
      {
        assetId: clip.assetId,
        expectedVersion: d.version,
        contentHash: d.contentHash,
        consent: true,
      },
      token,
      "reuse",
    );
    assert.equal(reuse.status, 200);
    const understanding = await f.call(
      "/api/mobile/v1/requests/" + IDS.request + "/understanding",
      {
        expectedVersion: d.version,
        contentHash: d.contentHash,
        source: "reviewed_transcript",
        sourceText: clip.text,
        transcriptJobId: clip.job.jobId,
      },
      token,
      "understanding",
    );
    assert.equal(understanding.body.confirmationState, "proposed");
    assert.deepEqual(understanding.body.tasks, []);
    assert.equal(
      (await f.call("/api/mobile/v1/session/logout", {}, token)).status,
      204,
    );
    assert.equal(
      (await f.call("/api/mobile/v1/session/logout", {}, token)).status,
      204,
    );
    assert.equal(
      (await f.call("/api/mobile/v1/me", undefined, token)).status,
      401,
    );
  } finally {
    await f.close();
  }
});

test("enrollment replay checks original body and expires after two minutes", async () => {
  const f = await fixture();
  try {
    const initial = await f.call(
      "/api/mobile/v1/enroll",
      { invitationToken: DEV_INVITATION, deviceLabel: "Tablet" },
      undefined,
      "pair",
    );
    const replay = await f.call(
      "/api/mobile/v1/enroll",
      { invitationToken: DEV_INVITATION, deviceLabel: "Tablet" },
      undefined,
      "pair",
    );
    assert.equal(replay.body.idempotentReplay, true);
    assert.notEqual(replay.body.accessToken, initial.body.accessToken);
    assert.equal(
      (
        await f.call(
          "/api/mobile/v1/enroll",
          { invitationToken: DEV_INVITATION, deviceLabel: "Changed" },
          undefined,
          "pair",
        )
      ).body.code,
      "IDEMPOTENCY_CONFLICT",
    );
    f.store.invitations[digest(DEV_INVITATION)].consumedAt =
      Date.now() - 121000;
    assert.equal(
      (
        await f.call(
          "/api/mobile/v1/enroll",
          { invitationToken: DEV_INVITATION, deviceLabel: "Tablet" },
          undefined,
          "pair",
        )
      ).status,
      410,
    );
    assert.equal(
      (
        await f.call(
          "/api/mobile/v1/enroll",
          { invitationToken: "f".repeat(64) },
          undefined,
          "other",
        )
      ).status,
      410,
    );
  } finally {
    await f.close();
  }
});

test("fictional inbox exposes a complete mixed Task Card check and an assigned Pulse", async () => {
  const f = await fixture();
  try {
    const auth = (
      await f.call(
        "/api/mobile/v1/enroll",
        { invitationToken: DEV_INVITATION },
        undefined,
        "enroll",
      )
    ).body;
    const token = auth.accessToken;
    const list = (await f.call("/api/mobile/v1/requests", undefined, token))
      .body.requests;
    const check = list.find((r: { type: string }) => r.type === "confirmation");
    assert.equal(check.taskCardIds.length, 3);
    for (let i = 0; i < check.taskCardIds.length; i++) {
      const card = (
        await f.call(
          "/api/mobile/v1/task-cards/" + check.taskCardIds[i],
          undefined,
          token,
        )
      ).body;
      const route =
        i === 0
          ? "/api/mobile/v1/task-cards/" + card.id + "/attest"
          : "/api/mobile/v1x/task-cards/" + card.id + "/decision";
      const result = await f.call(
        route,
        {
          recordVersion: card.version,
          contentHash: card.hash,
          decision: ["correct", "needs_change", "not_mine"][i],
          ...(i === 1 ? { note: "Check the next owner." } : {}),
        },
        token,
        "mixed-" + i,
      );
      assert.equal(result.status, 200);
      assert.equal(result.body.checkReturned, i === 2);
    }
    const done = (
      await f.call("/api/mobile/v1/requests", undefined, token)
    ).body.requests.find(
      (r: { requestId: string }) => r.requestId === check.requestId,
    );
    assert.equal(done.state, "returned");
    assert.equal(done.needsYou, false);
    const pulses = (await f.call("/api/mobile/v1x/pulses", undefined, token))
      .body.pulses;
    assert.equal(pulses.length, 1);
    assert.equal(pulses[0].questions.length, 3);
    assert.ok(pulses[0].meetingId);
  } finally {
    await f.close();
  }
});
