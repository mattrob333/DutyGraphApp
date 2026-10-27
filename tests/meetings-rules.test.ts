import test from "node:test";
import assert from "node:assert/strict";
import {
  gateMeeting,
  agendaFor,
  canRecord,
  canAccept,
  nextLifecycle,
  pulseTeamStatus,
  pulseDone,
  closingReadiness,
} from "../shared/meetings/rules.ts";
import type {
  MeetingDefinition,
  MeetingProposal,
  TranscriptSegment,
  SpeakerMap,
  Pulse,
} from "../shared/meetings/types.ts";
const meeting: MeetingDefinition = {
  id: "m",
  companyId: "c",
  version: 1,
  hash: "h",
  title: "Carrier rollout",
  startsAt: null,
  minutes: 30,
  power: {
    purpose: "Decide the launch date",
    outcomes: ["Status update", "Decide launch"],
    execution: "Review evidence",
  },
  attendees: [
    { personId: "a", name: "Dana", roles: ["decision_maker"] },
    { personId: "b", name: "Priya", roles: ["resource"] },
    { personId: "c", name: "Marcus", roles: ["needs_to_know"] },
  ],
  meetingType: "DECISION",
  secondaryPhases: [],
  agenda: [],
  gate: null,
  routeChoice: null,
  state: "REQUESTED",
  createdBy: "a",
  createdAt: "",
  updatedAt: "",
};
const m = { ...meeting, agenda: agendaFor(meeting) };
test("gate enforces purpose, decision authority, sensitivity and deterministic minutes", () => {
  assert.equal(
    gateMeeting({ ...m, power: { ...m.power, purpose: "" } }).mode,
    "INSUFFICIENT_INFO",
  );
  assert.equal(
    gateMeeting({ ...m, attendees: m.attendees.slice(1) }).mode,
    "INSUFFICIENT_INFO",
  );
  assert.equal(
    gateMeeting({ ...m, power: { ...m.power, purpose: "Discuss harassment" } })
      .route,
    "HUMAN_ESCALATION",
  );
  const g = gateMeeting(m);
  assert.equal(g.mode, "HYBRID");
  assert.equal(g.liveMinutes, 15);
  assert.deepEqual(g.releasedPersonIds, ["c"]);
  assert.equal(gateMeeting(m, { allSatisfied: true }).mode, "NO_MEETING");
  assert.equal(
    gateMeeting({
      ...m,
      meetingType: "INFORMATIONAL",
      power: {
        ...m.power,
        purpose: "Share updates",
        outcomes: ["Weekly status"],
      },
    }).mode,
    "ASYNC",
  );
  assert.equal(
    gateMeeting({ ...m, agenda: m.agenda.map((t) => ({ ...t, async: false })) })
      .mode,
    "LIVE",
  );
});
test("model cannot override authority, consent or arithmetic", () => {
  const suggestion = {
    ...gateMeeting(m),
    mode: "LIVE" as const,
    liveMinutes: 9999,
    requiredPersonIds: ["stranger"],
  };
  assert.equal(
    gateMeeting({ ...m, attendees: [] }, { model: suggestion }).mode,
    "INSUFFICIENT_INFO",
  );
  const g = gateMeeting(
    { ...m, agenda: m.agenda.map((t) => ({ ...t, async: false })) },
    { model: suggestion },
  );
  assert.notEqual(g.liveMinutes, 9999);
  assert.ok(!g.requiredPersonIds.includes("stranger"));
  assert.equal(
    canRecord(
      [{ personKey: "a", name: "Dana", state: "consented", at: "now" }],
      m.attendees,
    ),
    false,
  );
  assert.equal(
    canRecord(
      m.attendees.map((a) => ({
        personKey: a.personId!,
        name: a.name,
        state: a.personId === "c" ? "declined" : "consented",
        at: "now",
      })),
      m.attendees,
    ),
    true,
  );
});
test("lifecycle rejects skipped and terminal moves", () => {
  assert.equal(nextLifecycle("REQUESTED", "EVALUATING"), "EVALUATING");
  assert.throws(() => nextLifecycle("REQUESTED", "COMPLETE"));
  assert.equal(nextLifecycle("IN_SESSION", "PAUSED"), "PAUSED");
  assert.equal(nextLifecycle("PAUSED", "IN_SESSION"), "IN_SESSION");
  assert.throws(() => nextLifecycle("COMPLETE", "REQUESTED"));
});
test("proposal sources must be current, committed, included and mapped", () => {
  const segment: TranscriptSegment = {
    id: "s",
    revision: 1,
    sessionId: "session",
    startMs: 0,
    endMs: 1000,
    text: "We will check the carrier.",
    speakerCluster: "S1",
    source: "batch",
    committed: true,
  };
  const p: MeetingProposal = {
    id: "p",
    sessionId: "session",
    kind: "claim",
    state: "proposed",
    version: 1,
    hash: "x",
    sources: [
      {
        segmentId: "s",
        revision: 1,
        quote: segment.text,
        speakerCluster: "S1",
        personKey: null,
      },
    ],
    evidence: "observed",
    body: { kind: "claim", fieldPath: "carrier", value: "Check" },
    decidedBy: null,
    decidedAt: null,
  };
  const map: SpeakerMap = {
    sessionId: "session",
    entries: [
      {
        cluster: "S1",
        personKey: "a",
        suggested: false,
        confirmedBy: "leader",
      },
    ],
  };
  assert.equal(canAccept(p, [segment], { ...map, entries: [] }).ok, false);
  assert.equal(canAccept(p, [segment], map).ok, true);
  assert.equal(canAccept(p, [{ ...segment, revision: 2 }], map).ok, false);
  assert.equal(
    canAccept(p, [{ ...segment, excluded: "declined_consent" }], map).ok,
    false,
  );
  assert.equal(canAccept({ ...p, sources: [] }, [segment], map).ok, false);
  for (const forged of [
    { quote: "" },
    { speakerCluster: "S2" },
    { personKey: "someone-else" },
  ])
    assert.equal(
      canAccept(
        { ...p, sources: [{ ...p.sources[0]!, ...forged }] },
        [segment],
        map,
      ).ok,
      false,
    );
});
test("Pulse status discloses completion only and due time completes collection", () => {
  const p: Pulse = {
    id: "p",
    meetingId: "m",
    title: "Status",
    dueAt: "2026-01-01T00:00:00.000Z",
    estimateMinutes: 2,
    perPerson: [
      { personId: "a", questions: [], state: "complete" },
      { personId: "b", questions: [], state: "not_started" },
    ],
  };
  assert.equal(pulseDone(p, Date.parse("2026-01-02")), true);
  const status = pulseTeamStatus(p, { a: "Dana", b: "Priya" });
  assert.deepEqual(Object.keys(status.people[0]), ["name", "state"]);
  assert.equal(status.done, 1);
  assert.equal(closingReadiness([{ met: false }], [], []).complete, false);
  assert.equal(
    closingReadiness([{ met: false }], [], [], "Follow up tomorrow").partial,
    true,
  );
});

test("review lifecycle reflects human review without claiming objectives complete", async () => {
  const { reviewLifecycle } = await import("../shared/meetings/rules.ts");
  const base: MeetingProposal = {
    id: "p",
    sessionId: "s",
    kind: "claim",
    state: "proposed",
    version: 1,
    hash: "h",
    sources: [],
    evidence: "belief",
    body: { kind: "claim", fieldPath: "note", value: "Review" },
    decidedBy: null,
    decidedAt: null,
  };
  assert.equal(reviewLifecycle([]), "REVIEW_PENDING");
  assert.equal(reviewLifecycle([base]), "REVIEW_PENDING");
  assert.equal(
    reviewLifecycle([{ ...base, state: "accepted" }, base]),
    "PARTIALLY_APPROVED",
  );
  assert.equal(reviewLifecycle([{ ...base, state: "accepted" }]), "APPROVED");
  assert.equal(
    reviewLifecycle([
      {
        ...base,
        state: "accepted",
        kind: "action",
        body: {
          kind: "action",
          what: "Check",
          ownerPersonKey: "p",
          due: null,
          dependsOn: [],
          doneWhen: "Checked",
          status: "proposed",
        },
      },
    ]),
    "PARTIALLY_APPROVED",
  );
});
