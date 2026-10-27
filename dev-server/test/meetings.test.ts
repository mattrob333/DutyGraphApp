import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/index.ts";
import { IDS, uuid, digest, issue } from "../src/core.ts";
import { configFromEnv } from "../src/config.ts";
const api = "/api/mobile/meetings/v1";
async function setup() {
  const dir = mkdtempSync(join(tmpdir(), "dg-server-"));
  const config = { ...configFromEnv({}), audioDir: dir };
  const { app, store } = createApp({ config });
  const server = createServer(app).listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
  let token = "";
  const call = async (
    path: string,
    body?: unknown,
    key: string = uuid(),
    method?: string,
  ) => {
    const r = await fetch(base + path, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, body: r.status === 204 ? null : await r.json() };
  };
  const code = (await call("/dev/pairing-code", {})).body.pairingCode;
  const session = (await call(api + "/advisor/pair", { pairingCode: code }))
    .body;
  token = session.accessToken;
  const meeting = (
    await call(api + "/meetings", {
      title: "Carrier decision",
      startsAt: null,
      minutes: 30,
      purpose: "Decide the carrier launch",
      outcomes: ["Carrier status update", "Decide launch date"],
      execution: "Review facts and decide",
      attendees: [
        { personId: IDS.participant, roles: ["decision_maker"] },
        { personId: IDS.priya, roles: ["resource"] },
        { personId: IDS.marcus, roles: ["needs_to_know"] },
      ],
    })
  ).body;
  return {
    call,
    store,
    meeting,
    session,
    setToken: (t: string) => {
      token = t;
    },
    close: async () => {
      await new Promise<void>((r) => server.close(() => r()));
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
async function start(
  f: Awaited<ReturnType<typeof setup>>,
  mode = "copilot",
  decline = false,
) {
  await f.call(api + "/meetings/" + f.meeting.id + "/plan", {});
  const s = (
    await f.call(api + "/meetings/" + f.meeting.id + "/sessions", { mode })
  ).body;
  const consent = {
    attendees: f.meeting.attendees.map((a: { personId: string }) => ({
      personId: a.personId,
      state: decline && a.personId === IDS.marcus ? "declined" : "consented",
      at: new Date().toISOString(),
    })),
    noticeVersion: "notice-1",
    appVersion: "1.0.0",
  };
  return { s, consent };
}
test("advisor pairing is company scoped, plans compute Hybrid, stale patch fails", async () => {
  const f = await setup();
  try {
    const plan = await f.call(api + "/meetings/" + f.meeting.id + "/plan", {});
    assert.equal(plan.status, 200);
    assert.equal(plan.body.gate.mode, "HYBRID");
    assert.equal(plan.body.gate.liveMinutes, 15);
    assert.equal(
      (
        await f.call(
          api + "/meetings/" + f.meeting.id,
          { expectedVersion: 1, title: "Stale" },
          undefined,
          "PATCH",
        )
      ).body.code,
      "VERSION_CONFLICT",
    );
    const other = issue(
      f.store,
      { companyId: IDS.otherCompany, personId: IDS.advisor },
      "advisor_mobile",
    );
    f.setToken(other.accessToken);
    assert.equal((await f.call(api + "/meetings/" + f.meeting.id)).status, 403);
  } finally {
    await f.close();
  }
});
test("consent gates ingestion; chunk resume verifies both checksums; finish cites committed evidence", async () => {
  const f = await setup();
  try {
    const { s, consent } = await start(f);
    const audio = Buffer.from("fictional recording");
    const chunk = {
      segmentIndex: 0,
      chunkIndex: 0,
      chunkCount: 1,
      sha256: digest(audio),
      segmentSha256: digest(audio),
      data: audio.toString("base64"),
    };
    assert.equal(
      (await f.call(api + "/sessions/" + s.id + "/segments", chunk)).body.code,
      "CONSENT_REQUIRED",
    );
    await f.call(api + "/sessions/" + s.id + "/consent", consent);
    assert.equal(
      (
        await f.call(api + "/sessions/" + s.id + "/segments", {
          ...chunk,
          sha256: "0".repeat(64),
        })
      ).body.code,
      "CHECKSUM_MISMATCH",
    );
    const first = await f.call(
      api + "/sessions/" + s.id + "/segments",
      chunk,
      "upload",
    );
    const again = await f.call(
      api + "/sessions/" + s.id + "/segments",
      chunk,
      "upload",
    );
    assert.deepEqual(first.body, again.body);
    assert.equal(first.body.complete, true);
    const finish = await f.call(api + "/sessions/" + s.id + "/finish", {});
    assert.equal(finish.status, 200);
    assert.ok(finish.body.proposals.length > 0);
    assert.ok(
      finish.body.proposals.every(
        (p: { sources: unknown[] }) => p.sources.length > 0,
      ),
    );
    const proposal = finish.body.proposals[0];
    assert.equal(
      (
        await f.call(api + "/proposals/" + proposal.id + "/decision", {
          decision: "accept",
          expectedVersion: proposal.version,
        })
      ).body.code,
      "EVIDENCE_REQUIRED",
    );
    await f.call(api + "/sessions/" + s.id + "/speakers", {
      entries: [
        {
          cluster: proposal.sources[0].speakerCluster,
          personKey: IDS.participant,
        },
      ],
    });
    const accepted = await f.call(
      api + "/proposals/" + proposal.id + "/decision",
      { decision: "accept", expectedVersion: proposal.version },
    );
    assert.equal(accepted.status, 200);
    const snap = (await f.call(api + "/sessions/" + s.id)).body;
    const source = snap.transcript.find(
      (t: { id: string }) => t.id === proposal.sources[0].segmentId,
    );
    assert.equal(
      (
        await f.call(api + "/sessions/" + s.id + "/transcript", {
          segments: [
            {
              id: source.id,
              revision: 2,
              startMs: source.startMs,
              endMs: source.endMs,
              text: "Corrected evidence.",
              speakerCluster: source.speakerCluster,
            },
          ],
        })
      ).status,
      200,
    );
    assert.equal(
      (await f.call(api + "/sessions/" + s.id + "/proposals")).body.proposals[0]
        .state,
      "stale",
    );
  } finally {
    await f.close();
  }
});
test("declined speaker excluded from proposals, facilitator only explicit triggers and stop leaves recording open", async () => {
  const f = await setup();
  try {
    const { s, consent } = await start(f, "facilitator", true);
    await f.call(api + "/sessions/" + s.id + "/consent", consent);
    await f.call(api + "/sessions/" + s.id + "/speakers", {
      entries: [
        { cluster: "S1", personKey: IDS.participant },
        { cluster: "S2", personKey: IDS.marcus },
      ],
    });
    await f.call(api + "/sessions/" + s.id + "/transcript", {
      segments: [
        {
          id: uuid(),
          revision: 1,
          startMs: 0,
          endMs: 1000,
          text: "We decided to review the launch.",
          speaker: "S1",
        },
        {
          id: uuid(),
          revision: 1,
          startMs: 1000,
          endMs: 2000,
          text: "Excluded private words.",
          speaker: "S2",
        },
      ],
    });
    assert.equal(
      (
        await f.call(api + "/sessions/" + s.id + "/facilitator/turn", {
          trigger: "automatic",
        })
      ).status,
      400,
    );
    const turn = await f.call(api + "/sessions/" + s.id + "/facilitator/turn", {
      trigger: "opening",
    });
    assert.equal(turn.status, 200);
    assert.ok(turn.body.promptHash);
    await f.call(api + "/sessions/" + s.id + "/state", { control: "stop" });
    assert.equal(
      (
        await f.call(api + "/sessions/" + s.id + "/facilitator/turn", {
          trigger: "silence",
        })
      ).body.code,
      "AI_STOPPED",
    );
    const snapshot = (await f.call(api + "/sessions/" + s.id)).body;
    assert.equal(snapshot.endedAt, null);
    const finish = await f.call(api + "/sessions/" + s.id + "/finish", {});
    assert.equal(finish.status, 200);
    assert.ok(
      !JSON.stringify(finish.body.proposals).includes("Excluded private words"),
    );
  } finally {
    await f.close();
  }
});
test("kickoff saves attributed notes, setup preserves quotes, sensitive meeting cannot start", async () => {
  const f = await setup();
  try {
    const notes = await f.call(api + "/kickoff/" + f.meeting.id + "/notes", {
      notes: [
        {
          topicId: "business",
          speakerPersonId: IDS.participant,
          text: "We ship workshop parts.",
        },
      ],
    });
    assert.equal(notes.body.claims[0].quote, "We ship workshop parts.");
    assert.equal(
      (await f.call(api + "/kickoff/" + f.meeting.id + "/notes")).body.notes
        .length,
      1,
    );
    const setup = (await f.call(api + "/setup", {})).body;
    assert.equal(
      (
        await f.call(api + "/setup/" + setup.id + "/understand", {
          answers: { "question.0": "We distribute workshop parts." },
        })
      ).body.proposals[0].quote,
      "We distribute workshop parts.",
    );
    await f.call(
      api + "/meetings/" + f.meeting.id,
      { expectedVersion: 1, purpose: "Discuss a legal complaint" },
      undefined,
      "PATCH",
    );
    assert.equal(
      (
        await f.call(api + "/meetings/" + f.meeting.id + "/sessions", {
          mode: "capture",
        })
      ).body.code,
      "MEETING_NOT_READY",
    );
  } finally {
    await f.close();
  }
});

test("changing a plan invalidates the gate; overdue partial Pulse keeps missing work visible", async () => {
  const f = await setup();
  try {
    const planned = (
      await f.call(api + "/meetings/" + f.meeting.id + "/plan", {})
    ).body.meeting;
    assert.equal(
      (
        await f.call(api + "/meetings/" + f.meeting.id + "/route", {
          choice: "shorter",
        })
      ).status,
      200,
    );
    const current = (await f.call(api + "/meetings/" + f.meeting.id)).body;
    const updated = await f.call(
      api + "/meetings/" + f.meeting.id,
      { expectedVersion: current.version, purpose: "Discuss a legal issue" },
      undefined,
      "PATCH",
    );
    assert.equal(updated.body.gate, null);
    assert.equal(
      (
        await f.call(api + "/meetings/" + f.meeting.id + "/sessions", {
          mode: "copilot",
        })
      ).body.code,
      "MEETING_NOT_READY",
    );
    const draft = (
      await f.call(
        api + "/meetings/" + f.meeting.id,
        {
          expectedVersion: updated.body.version,
          purpose: "Share weekly updates",
          outcomes: ["Status update"],
          meetingType: "INFORMATIONAL",
        },
        undefined,
        "PATCH",
      )
    ).body;
    await f.call(api + "/meetings/" + draft.id + "/plan", {});
    const pulse = await f.call(api + "/meetings/" + draft.id + "/pulse", {
      dueAt: "2020-01-01T00:00:00.000Z",
    });
    assert.equal(pulse.status, 201);
    const review = await f.call(api + "/meetings/" + draft.id + "/pulse");
    assert.equal(review.body.pulses.length, 1);
    assert.notEqual(review.body.gate.mode, "NO_MEETING");
    assert.match(review.body.gate.reason, /missing/);
    assert.ok(planned.hash);
  } finally {
    await f.close();
  }
});

test("facilitator control transitions and realtime credentials stay out of persisted command responses", async () => {
  const f = await setup();
  try {
    await f.call(api + "/meetings/" + f.meeting.id + "/plan", {});
    const s = (
      await f.call(api + "/meetings/" + f.meeting.id + "/sessions", {
        mode: "facilitator",
        voice: "realtime",
      })
    ).body;
    const consent = {
      attendees: f.meeting.attendees.map((a: { personId: string }) => ({
        personId: a.personId,
        state: "consented",
        at: new Date().toISOString(),
      })),
      noticeVersion: "v1",
      appVersion: "v1",
    };
    await f.call(api + "/sessions/" + s.id + "/consent", consent);
    assert.equal(
      (await f.call(api + "/sessions/" + s.id + "/state", { to: "COMPLETE" }))
        .body.code,
      "ILLEGAL_TRANSITION",
    );
    assert.equal(
      (await f.call(api + "/sessions/" + s.id + "/state", { to: "OPEN" })).body
        .facilitatorState,
      "OPEN",
    );
    assert.equal(
      (
        await f.call(api + "/sessions/" + s.id + "/topic", {
          topicId: "unknown",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await f.call(api + "/sessions/" + s.id + "/topic", {
          topicId: "topic-1",
        })
      ).body.currentTopicId,
      "topic-1",
    );
    await f.call(api + "/sessions/" + s.id + "/state", {
      control: "extend_topic",
    });
    await f.call(api + "/sessions/" + s.id + "/state", {
      control: "next_topic",
    });
    await f.call(api + "/sessions/" + s.id + "/state", { control: "skip" });
    await f.call(api + "/sessions/" + s.id + "/state", { control: "mute" });
    await f.call(api + "/sessions/" + s.id + "/state", {
      control: "next_topic",
    });
    assert.equal(
      (await f.call(api + "/sessions/" + s.id + "/realtime", {})).body.code,
      "AI_STOPPED",
    );
    await f.call(api + "/sessions/" + s.id + "/state", { control: "unmute" });
    const grant = await f.call(
      api + "/sessions/" + s.id + "/realtime",
      {},
      "grant",
    );
    assert.equal(grant.body.available, true);
    assert.ok(
      !JSON.stringify(f.store.records).includes(grant.body.clientSecret),
    );
    assert.equal(
      (
        await f.call(
          api + "/sessions/" + s.id + "/realtime",
          { sdp: "changed" },
          "grant",
        )
      ).body.code,
      "IDEMPOTENCY_CONFLICT",
    );
  } finally {
    await f.close();
  }
});

test("action owners stay unknown until explicitly named; closing confirmations merge and are audited", async () => {
  const f = await setup();
  try {
    const { s, consent } = await start(f);
    await f.call(api + "/sessions/" + s.id + "/consent", consent);
    const segments = [
      {
        id: uuid(),
        revision: 1,
        startMs: 0,
        endMs: 1000,
        text: "Priya will check the credentials.",
        speaker: "S1",
      },
      {
        id: uuid(),
        revision: 1,
        startMs: 1000,
        endMs: 2000,
        text: "We will review the delivery.",
        speaker: "S2",
      },
    ];
    await f.call(api + "/sessions/" + s.id + "/transcript", { segments });
    await f.call(api + "/sessions/" + s.id + "/speakers", {
      entries: [
        { cluster: "S1", personKey: IDS.participant },
        { cluster: "S2", personKey: IDS.priya },
      ],
    });
    const finish = await f.call(api + "/sessions/" + s.id + "/finish", {});
    const [first, second] = finish.body.proposals;
    assert.equal(first.body.ownerPersonKey, null);
    const owned = (
      await f.call(api + "/proposals/" + first.id + "/decision", {
        decision: "edit",
        expectedVersion: first.version,
        text: first.body.what,
        ownerPersonKey: IDS.priya,
      })
    ).body;
    assert.equal(owned.body.ownerPersonKey, IDS.priya);
    assert.equal(
      (
        await f.call(api + "/sessions/" + s.id + "/closing", {
          items: [
            {
              proposalId: owned.id,
              ownerPersonKey: IDS.participant,
              confirmation: "confirmed",
            },
          ],
        })
      ).body.code,
      "OWNER_REQUIRED",
    );
    assert.equal(
      (
        await f.call(api + "/sessions/" + s.id + "/closing", {
          items: [
            {
              proposalId: owned.id,
              ownerPersonKey: IDS.priya,
              confirmation: "confirmed",
            },
          ],
        })
      ).body.items.length,
      1,
    );
    assert.equal(
      (
        await f.call(api + "/sessions/" + s.id + "/closing", {
          items: [
            {
              proposalId: second.id,
              ownerPersonKey: null,
              confirmation: "changed",
              note: "Need an owner",
            },
          ],
        })
      ).body.items.length,
      2,
    );
    const snapshot = (await f.call(api + "/sessions/" + s.id)).body;
    assert.equal(
      snapshot.proposals.find((p: { id: string }) => p.id === owned.id).body
        .status,
      "assigned",
    );
    assert.ok(
      snapshot.log.some(
        (e: { kind: string }) => e.kind === "owner_confirmations",
      ),
    );
    assert.equal(
      (
        await f.call(api + "/proposals/" + second.id + "/decision", {
          decision: "reject",
          expectedVersion: second.version,
        })
      ).body.state,
      "rejected",
    );
    const follow = await f.call(
      api + "/proposals/" + second.id + "/follow-up",
      { personId: IDS.priya, text: "Who will review this delivery?" },
    );
    assert.equal(follow.body.state, "proposed");
  } finally {
    await f.close();
  }
});

test("consent withdrawal purges words and invalidates accepted attribution; unknown sources cannot bypass decline", async () => {
  const f = await setup();
  try {
    const { s, consent } = await start(f);
    await f.call(api + "/sessions/" + s.id + "/consent", consent);
    await f.call(api + "/sessions/" + s.id + "/speakers", {
      entries: [{ cluster: "S1", personKey: IDS.participant }],
    });
    const segment = {
      id: uuid(),
      revision: 1,
      startMs: 0,
      endMs: 1000,
      text: "Confidential withdrawal example.",
      speaker: "S1",
    };
    await f.call(api + "/sessions/" + s.id + "/transcript", {
      segments: [segment],
    });
    const finished = await f.call(
      api + "/sessions/" + s.id + "/finish",
      {},
      "withdraw-finish",
    );
    const proposal = finished.body.proposals[0];
    await f.call(api + "/proposals/" + proposal.id + "/decision", {
      decision: "accept",
      expectedVersion: proposal.version,
    });
    await f.call(api + "/sessions/" + s.id + "/consent", {
      ...consent,
      attendees: [
        {
          personId: IDS.participant,
          state: "declined",
          at: new Date().toISOString(),
        },
      ],
    });
    const snapshot = (await f.call(api + "/sessions/" + s.id)).body;
    assert.equal(snapshot.transcript[0].text, "");
    assert.equal(snapshot.proposals[0].state, "stale");
    assert.ok(
      !JSON.stringify(snapshot).includes("Confidential withdrawal example."),
    );
    assert.ok(
      !JSON.stringify(f.store.records).includes(
        "Confidential withdrawal example.",
      ),
    );
    assert.equal(
      (
        await f.call(
          api + "/sessions/" + s.id + "/finish",
          {},
          "withdraw-finish",
        )
      ).body.code,
      "CONSENT_CHANGED",
    );
    assert.equal(
      (
        await f.call(api + "/proposals/" + proposal.id + "/decision", {
          decision: "accept",
          expectedVersion: snapshot.proposals[0].version,
        })
      ).body.code,
      "EVIDENCE_REQUIRED",
    );
  } finally {
    await f.close();
  }
});

test("kickoff cannot overwrite another company note or manufacture claim sources; setup confirms reviewed quotes only", async () => {
  const f = await setup();
  try {
    const id = uuid();
    f.store.put(
      "notes",
      id,
      {
        id,
        meetingId: uuid(),
        topicId: "business",
        speakerPersonId: IDS.marcus,
        text: "Other company words",
        at: new Date().toISOString(),
      },
      IDS.otherCompany,
    );
    assert.equal(
      (
        await f.call(api + "/kickoff/" + f.meeting.id + "/notes", {
          notes: [
            {
              id,
              topicId: "business",
              speakerPersonId: IDS.participant,
              text: "Overwrite",
            },
          ],
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await f.call(api + "/kickoff/" + f.meeting.id + "/notes", {
          notes: [
            {
              topicId: "business",
              speakerPersonId: IDS.participant,
              text: "Workshop parts",
            },
          ],
          claims: [
            {
              fieldPath: "business",
              value: "Wrong",
              quote: "Not in notes",
              speakerPersonId: IDS.participant,
            },
          ],
        })
      ).body.code,
      "EVIDENCE_REQUIRED",
    );
    const setup = (await f.call(api + "/setup", { source: "owner_supplied" }))
      .body;
    const understood = (
      await f.call(api + "/setup/" + setup.id + "/understand", {
        answers: [{ key: "question.0", text: "Workshop distribution" }],
      })
    ).body;
    assert.equal(
      (await f.call(api + "/setup/" + setup.id + "/confirm", understood)).body
        .confirmed,
      true,
    );
    assert.equal(
      (
        await f.call(api + "/setup/" + setup.id + "/confirm", {
          proposals: [{ ...understood.proposals[0], quote: "Fabricated" }],
        })
      ).body.code,
      "EVIDENCE_REQUIRED",
    );
  } finally {
    await f.close();
  }
});

test("all structured proposal edits preserve kind, source scope and human owner confirmation", async () => {
  const f = await setup();
  try {
    const { s, consent } = await start(f);
    await f.call(api + "/sessions/" + s.id + "/consent", consent);
    const id = uuid(),
      text = "Priya will check the carrier.";
    await f.call(api + "/sessions/" + s.id + "/transcript", {
      segments: [
        { id, revision: 1, startMs: 0, endMs: 1000, text, speaker: "S1" },
      ],
    });
    await f.call(api + "/sessions/" + s.id + "/speakers", {
      entries: [{ cluster: "S1", personKey: IDS.participant }],
    });
    const finished = await f.call(api + "/sessions/" + s.id + "/finish", {});
    const original = finished.body.proposals[0],
      source = original.sources[0];
    const bodies: import("../../shared/meetings/types.ts").MeetingProposal["body"][] =
      [
        {
          kind: "decision",
          decision: "Review the carrier",
          decidedByPersonKey: IDS.participant,
          rationale: "Stated plan",
          alternatives: [],
          deferred: false,
        },
        {
          kind: "action",
          what: "Check the carrier",
          ownerPersonKey: IDS.priya,
          due: null,
          dependsOn: [],
          doneWhen: "Carrier checked",
          status: "assigned",
        },
        {
          kind: "open_question",
          question: "Who owns the next step?",
          askPersonKey: IDS.priya,
        },
        {
          kind: "task_card_delta",
          taskCardId: IDS.task,
          field: "trigger",
          from: "Ready",
          to: "Ready and checked",
        },
        {
          kind: "responsibility_delta",
          personKey: IDS.priya,
          duty: "Check carrier",
          change: "add",
        },
        {
          kind: "contradiction",
          claimA: { text: "Check carrier", source },
          claimB: { text: "Confirm carrier", source },
        },
        { kind: "claim", fieldPath: "carrier.review", value: "Needs review" },
      ];
    for (const body of bodies) {
      const proposal = { ...original, id: uuid(), kind: body.kind, body };
      f.store.put("proposals", proposal.id, proposal, IDS.company);
      const changed = await f.call(
        api + "/proposals/" + proposal.id + "/decision",
        { decision: "edit", expectedVersion: proposal.version, body },
      );
      assert.equal(changed.status, 200, JSON.stringify(changed.body));
      assert.equal(changed.body.body.kind, body.kind);
      if (body.kind === "action")
        assert.equal(changed.body.body.status, "proposed");
    }
    const invalid = await f.call(
      api + "/proposals/" + original.id + "/decision",
      {
        decision: "edit",
        expectedVersion: original.version,
        body: { ...bodies[1], ownerPersonKey: "outside-company" },
      },
    );
    assert.equal(invalid.status, 403);
    const accepted = await f.call(
      api + "/proposals/" + original.id + "/decision",
      { decision: "accept", expectedVersion: original.version },
    );
    assert.equal(accepted.status, 200);
    assert.equal(
      (await f.call(api + "/meetings/" + f.meeting.id)).body.state,
      "PARTIALLY_APPROVED",
    );
  } finally {
    await f.close();
  }
});
