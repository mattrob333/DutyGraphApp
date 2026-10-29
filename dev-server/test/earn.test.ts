import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { createApp } from "../src/index.ts";
import { Store, IDS, issue } from "../src/core.ts";
import { manualEarnCard } from "../src/earn-fixtures.ts";
async function fixture(options: Parameters<typeof createApp>[0] = {}) {
  const store = options.store ?? new Store(),
    context = createApp({ ...options, store }),
    server = createServer(context.app).listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
  const session = issue(
    store,
    { companyId: IDS.company, personId: IDS.participant },
    "participant_mobile",
  );
  const call = async (
    path: string,
    body?: unknown,
    key?: string,
    token: string | undefined = session.accessToken,
  ) => {
    const response = await fetch(base + "/api/mobile/v1/earn" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...(token ? { Authorization: "Bearer " + token } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  return {
    store,
    base,
    call,
    session,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
test("Earn dev routes require a participant principal and hide foreign drafts as404", async () => {
  const f = await fixture();
  try {
    assert.equal(
      (await f.call("/summary", undefined, undefined, "")).status,
      401,
    );
    const advisor = issue(
      f.store,
      { companyId: IDS.company, personId: IDS.advisor },
      "advisor_mobile",
    );
    assert.equal(
      (await f.call("/summary", undefined, undefined, advisor.accessToken))
        .status,
      403,
    );
    const list = await f.call("/drafts?state=waiting");
    assert.equal(list.status, 200);
    assert.equal(list.body.drafts.length, 2);
    for (const subject of [
      { companyId: IDS.company, personId: IDS.priya },
      { companyId: IDS.otherCompany, personId: IDS.participant },
    ]) {
      const other = issue(f.store, subject, "participant_mobile");
      assert.equal(
        (
          await f.call(
            "/drafts/" + list.body.drafts[0].id,
            undefined,
            undefined,
            other.accessToken,
          )
        ).status,
        404,
      );
    }
    assert.equal(
      (await f.call("/drafts/not-a-draft")).body.code,
      "DRAFT_NOT_FOUND",
    );
    assert.equal(
      (
        await f.call(
          "/drafts/" + list.body.drafts[0].id + "/confirm",
          { expectedVersion: 1, personId: IDS.priya },
          "smuggle",
        )
      ).status,
      400,
    );
  } finally {
    await f.close();
  }
});
test("Confirm and Not mine preserve versions, retry keys and separate proposed records", async () => {
  const f = await fixture();
  try {
    const drafts = (await f.call("/drafts")).body.drafts,
      first = drafts[0],
      path = "/drafts/" + first.id + "/confirm";
    assert.equal(
      (await f.call(path, { expectedVersion: 1 })).body.code,
      "IDEMPOTENCY_REQUIRED",
    );
    const [a, b] = await Promise.all([
      f.call(path, { expectedVersion: 1 }, "confirm"),
      f.call(path, { expectedVersion: 1 }, "confirm"),
    ]);
    assert.equal(a.status, 200);
    assert.equal(b.body.taskRecordId, a.body.taskRecordId);
    assert.equal(a.body.draft.state, "confirmed");
    assert.equal(a.body.claim.state, "manager_checking");
    assert.equal(
      f.store.records.tasks[a.body.taskRecordId].value &&
        (f.store.records.tasks[a.body.taskRecordId].value as any).state,
      "proposed",
    );
    assert.equal(
      (await f.call(path, { expectedVersion: 1 }, "another")).body.code,
      "VERSION_CONFLICT",
    );
    assert.equal(
      (await f.call(path, { expectedVersion: 2 }, "confirm")).body.code,
      "IDEMPOTENCY_CONFLICT",
    );
    const declined = await f.call(
      "/drafts/" + drafts[1].id + "/not-mine",
      { expectedVersion: 1 },
      "not-mine",
    );
    assert.equal(declined.body.state, "not_mine");
    assert.equal(
      (
        await f.call(
          "/drafts/" + drafts[1].id + "/not-mine",
          { expectedVersion: 1 },
          "not-mine",
        )
      ).body.version,
      2,
    );
  } finally {
    await f.close();
  }
});
test("Local draft creation advertises capability and never persists refused tokens or secrets", async () => {
  const f = await fixture();
  try {
    assert.deepEqual((await f.call("/capabilities")).body, {
      developmentFixture: true,
      draftCreation: true,
    });
    const unsafe = manualEarnCard();
    unsafe.aiIAlreadyUse = "password=fictional-password";
    unsafe.safety = ["Card 4242 4242 4242 4242"];
    const result = await f.call(
      "/drafts",
      { cards: [unsafe], sourceNote: "app" },
      "new",
    );
    assert.equal(result.status, 200);
    assert.equal(result.body.drafts[0].via, "app");
    assert.equal(result.body.drafts[0].state, "waiting");
    assert.equal(result.body.drafts[0].checks.secretsRemoved, 2);
    assert.match(result.body.drafts[0].card.aiIAlreadyUse, /\[removed\]/);
    const bad = manualEarnCard();
    bad.aiIAlreadyUse = "dgp_fictional_refused_value";
    const refusal = await f.call(
      "/drafts",
      { cards: [bad], sourceNote: "app" },
      "refuse",
    );
    assert.equal(refusal.body.refused[0].code, "DUTYGRAPH_TOKEN_IN_CARD");
    const persisted = JSON.stringify(f.store.records);
    assert.ok(!persisted.includes("dgp_fictional_refused_value"));
    assert.ok(!persisted.includes("fictional-password"));
    assert.ok(!persisted.includes("4242 4242 4242 4242"));
    const invalid = await f.call(
      "/drafts",
      {
        cards: [{ ...manualEarnCard(), companyId: IDS.otherCompany }],
        sourceNote: "app",
      },
      "invalid",
    );
    assert.equal(invalid.status, 400);
  } finally {
    await f.close();
  }
});
test("Earn-off views hide all amounts and reward ranges; board remains names and counts only", async () => {
  const f = await fixture({ earnEnabled: false });
  try {
    const summary = (await f.call("/summary")).body;
    assert.equal(summary.settings.enabled, false);
    assert.equal(summary.settings.perCardCents, 0);
    assert.equal(summary.me.earnedPaidCents, 0);
    assert.equal(summary.me.earnedWaitingCents, 0);
    assert.deepEqual(summary.claims, []);
    assert.ok(summary.fixes.every((row: any) => row.bonusCents === undefined));
    assert.equal(summary.settings.engagementFeeCents, 0);
    assert.equal(summary.settings.dutygraphKeepsCents, 0);
    assert.ok(
      (await f.call("/gaps")).body.gaps.every(
        (row: any) => row.rewardRangeCents === undefined,
      ),
    );
    const board = (await f.call("/team-board")).body;
    assert.equal(board.rows.length, 6);
    assert.deepEqual(
      board.rows.map((r: any) => r.name),
      board.rows
        .map((r: any) => r.name)
        .sort((a: string, b: string) => a.localeCompare(b)),
    );
    assert.ok(
      board.rows.every((row: any) => !("card" in row) && !("title" in row)),
    );
    assert.ok(
      (await f.call("/drafts")).body.drafts.every(
        (row: any) => row.checks.earnHint === "off",
      ),
    );
  } finally {
    await f.close();
  }
});
test("Fix commands reject identity/money fields and preserve linked proposed drafts/replays", async () => {
  const f = await fixture();
  try {
    const gap = (await f.call("/gaps")).body.gaps[0],
      body = {
        gapId: gap.id,
        text: "Check the returns tray before dispatch.",
        kind: "new_steps",
        measureName: "Returns checked a day",
        measureBefore: "12",
        hoursBefore: 20,
        hoursAfter: 5,
      };
    assert.equal(
      (await f.call("/fixes", { ...body, bonusCents: 432000 }, "money")).status,
      400,
    );
    assert.equal(
      (await f.call("/fixes", { ...body, personId: IDS.advisor }, "person"))
        .status,
      400,
    );
    assert.equal(
      (await f.call("/fixes", { ...body, hoursAfter: 2.22 }, "precision"))
        .status,
      400,
    );
    assert.equal(
      (await f.call("/fixes", { ...body, gapId: "another-gap" }, "gap")).status,
      404,
    );
    const card = {
      ...manualEarnCard(),
      kind: "proposed" as const,
      fixesGapId: gap.id,
    };
    const a = await f.call("/fixes", { ...body, card }, "fix");
    const b = await f.call("/fixes", { ...body, card }, "fix");
    assert.equal(a.body.fix.state, "sent");
    assert.equal(a.body.fix.bonusCents, undefined);
    assert.equal(a.body.fix.id, b.body.fix.id);
    assert.equal(a.body.draft.card.kind, "proposed");
    assert.equal(a.body.draft.card.fixesGapId, gap.id);
    assert.equal(a.body.draft.state, "waiting");
    assert.equal(
      (
        await f.call(
          "/fixes",
          { ...body, card: manualEarnCard() },
          "wrong-kind",
        )
      ).status,
      400,
    );
  } finally {
    await f.close();
  }
});
test("Expired drafts become readonly and revoked sessions cannot resume commands", async () => {
  const f = await fixture();
  try {
    const row = (await f.call("/drafts")).body.drafts[0];
    const state = Object.values(f.store.records.earn)[0].value as any;
    state.drafts[0].expiresAt = "2000-01-01T00:00:00.000Z";
    assert.equal((await f.call("/drafts/" + row.id)).body.state, "expired");
    assert.equal(
      (
        await f.call(
          "/drafts/" + row.id + "/confirm",
          { expectedVersion: 1 },
          "expired",
        )
      ).status,
      409,
    );
    Object.values(f.store.sessions).forEach((s) => (s.revoked = true));
    assert.equal((await f.call("/summary")).status, 401);
  } finally {
    await f.close();
  }
});
test("Proxy mode never shadows or seeds real Earn routes with development fixtures", async () => {
  let calls = 0;
  const f = await fixture({
    origin: "https://upstream.example.com",
    fetchImpl: async () => {
      calls++;
      return new Response(
        JSON.stringify({ code: "NOT_AVAILABLE", message: "Not enabled." }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    },
  });
  try {
    const result = await f.call("/capabilities");
    assert.equal(result.status, 404);
    assert.equal(calls, 1);
    assert.equal(f.store.records.earn, undefined);
    const health = await (await fetch(f.base + "/health")).json();
    assert.deepEqual(health.earn, {
      developmentFixture: false,
      draftCreation: false,
    });
  } finally {
    await f.close();
  }
});

test("Quoted credentials and punctuated PANs never persist", async () => {
  const f = await fixture();
  try {
    const secrets = [
      "fictional-json-secret",
      "fictional two word password",
      "fictional-bearer-secret",
      "4242.4242.4242.4242",
    ];
    const card = manualEarnCard();
    card.aiIAlreadyUse =
      '{"password":"fictional-json-secret"} password="fictional two word password" Authorization: Bearer fictional-bearer-secret Card 4242.4242.4242.4242';
    const result = await f.call(
      "/drafts",
      { cards: [card], sourceNote: "app" },
      "quoted-secrets",
    );
    assert.equal(result.status, 200);
    assert.equal(result.body.drafts[0].checks.secretsRemoved, 4);
    for (const secret of secrets) {
      assert.ok(!JSON.stringify(result.body).includes(secret));
      assert.ok(!JSON.stringify(f.store.records).includes(secret));
    }
  } finally {
    await f.close();
  }
});
test("Confirmation snapshot failure leaves no orphan in memory or disk; retry creates one", async () => {
  const dir = mkdtempSync(join(tmpdir(), "earn-atomic-"));
  const file = join(dir, "state.json");
  const store = new Store(file);
  const f = await fixture({ store });
  try {
    const row = (await f.call("/drafts")).body.drafts[0];
    const before = Object.keys(store.records.tasks ?? {}).length;
    const original = store.save.bind(store);
    let failOnce = true;
    store.save = () => {
      if (
        failOnce &&
        Object.keys(store.records.tasks ?? {}).length > before &&
        (Object.values(store.records.earn)[0].value as any).drafts.some(
          (d: any) => d.id === row.id && d.state === "confirmed",
        )
      ) {
        failOnce = false;
        throw new Error("synthetic snapshot failure");
      }
      original();
    };
    const path = "/drafts/" + row.id + "/confirm";
    assert.equal(
      (await f.call(path, { expectedVersion: 1 }, "durable-confirm")).status,
      500,
    );
    for (const snapshot of [store, new Store(file)]) {
      assert.equal(Object.keys(snapshot.records.tasks ?? {}).length, before);
      const state = Object.values(snapshot.records.earn)[0].value as any;
      assert.equal(
        state.drafts.find((d: any) => d.id === row.id).state,
        "waiting",
      );
    }
    const result = await f.call(
      path,
      { expectedVersion: 1 },
      "durable-confirm",
    );
    assert.equal(result.status, 200);
    assert.equal(Object.keys(new Store(file).records.tasks).length, before + 1);
    const state = Object.values(new Store(file).records.earn)[0].value as any;
    assert.equal(
      state.drafts.find((d: any) => d.id === row.id).taskRecordId,
      result.body.taskRecordId,
    );
    assert.equal(
      state.claims.filter((c: any) => c.draftId === row.id).length,
      1,
    );
  } finally {
    await f.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Committed confirmation receipt survives failure of wrapper acknowledgement save and restart", async () => {
  const dir = mkdtempSync(join(tmpdir(), "earn-receipt-"));
  const file = join(dir, "state.json");
  const store = new Store(file);
  const f = await fixture({ store });
  let restarted: Awaited<ReturnType<typeof fixture>> | undefined;
  try {
    const row = (await f.call("/drafts")).body.drafts[0];
    const before = Object.keys(store.records.tasks ?? {}).length;
    const original = store.save.bind(store);
    let committed = false;
    store.save = () => {
      if (Object.keys(store.records.tasks ?? {}).length > before) {
        if (committed)
          throw new Error("synthetic acknowledgement save failure");
        committed = true;
      }
      original();
    };
    const path = "/drafts/" + row.id + "/confirm";
    assert.equal(
      (await f.call(path, { expectedVersion: 1 }, "receipt-confirm")).status,
      500,
    );
    restarted = await fixture({ store: new Store(file) });
    // Retry the original session's pending request, rather than a new owner/key.
    const result = await restarted.call(
      path,
      { expectedVersion: 1 },
      "receipt-confirm",
      f.session.accessToken,
    );
    assert.equal(result.status, 200);
    assert.equal(result.body.draft.state, "confirmed");
    assert.equal(Object.keys(restarted.store.records.tasks).length, before + 1);
  } finally {
    await f.close();
    await restarted?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
