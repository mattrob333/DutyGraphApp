import { Store, IDS, version } from "./core.ts";
import { buildQuestions } from "../../shared/hands-free/hints.ts";
import type {
  MeetingDefinition,
  MeetingSession,
  MeetingProposal,
  TranscriptSegment,
  Pulse,
} from "../../shared/meetings/types.ts";
export const DEMO_MEETING_ID = "50000000-0000-4000-8000-000000000001";
export const DEMO_PULSE_ID = "60000000-0000-4000-8000-000000000001";
export const DEMO_WRAPUP_ID = "50000000-0000-4000-8000-000000000002";
export const DEMO_WRAPUP_SESSION_ID = "70000000-0000-4000-8000-000000000002";
export const DEMO_WRAPUP_ACTION_ID = "80000000-0000-4000-8000-000000000001";
export function seedDemoWrapUp(store: Store) {
  if (store.records.meetings?.[DEMO_WRAPUP_ID]) return;
  const now = new Date().toISOString();
  const meeting: MeetingDefinition = version({
    id: DEMO_WRAPUP_ID,
    companyId: IDS.company,
    title: "Monday dispatch review",
    startsAt: null,
    minutes: 20,
    power: {
      purpose: "Agree the dispatch follow-up",
      outcomes: ["Dispatch checks have a named owner"],
      execution: "Review the queue and confirm follow-up",
    },
    attendees: [
      { personId: IDS.participant, name: "Noah Reed", roles: ["executor"] },
      { personId: IDS.priya, name: "Priya Shah", roles: ["executor"] },
    ],
    meetingType: "DECISION",
    secondaryPhases: [],
    agenda: [],
    gate: null,
    routeChoice: "as_planned",
    state: "PARTIALLY_APPROVED",
    createdBy: IDS.advisor,
    createdAt: now,
    updatedAt: now,
  });
  const session: MeetingSession = version({
    id: DEMO_WRAPUP_SESSION_ID,
    companyId: IDS.company,
    meetingId: meeting.id,
    mode: "capture",
    voice: null,
    facilitatorState: "COMPLETE",
    currentTopicId: null,
    topicStartedAt: null,
    consents: meeting.attendees.map((a) => ({
      personKey: a.personId!,
      name: a.name,
      state: "consented",
      at: now,
    })),
    noticeVersion: "fictional-demo-1",
    appVersion: "1.0.0",
    startedAt: now,
    endedAt: now,
    promptVersion: null,
    promptHash: null,
    budgetCents: 200,
    spentCents: 0,
    log: [],
  });
  store.put("meetings", meeting.id, meeting, IDS.company);
  store.put("sessions", session.id, session, IDS.company);
  store.put(
    "speakers",
    session.id,
    {
      sessionId: session.id,
      entries: meeting.attendees.map((a, i) => ({
        cluster: `S${i + 1}`,
        personKey: a.personId,
        suggested: false,
        confirmedBy: IDS.advisor,
      })),
    },
    IDS.company,
  );
  for (const [index, owner] of [IDS.participant, IDS.priya].entries()) {
    const text =
      index === 0
        ? "I will check the dispatch queue before the next handoff."
        : "I will review the private IT credential checklist.";
    const transcript: TranscriptSegment = {
      id: `90000000-0000-4000-8000-00000000000${index + 1}`,
      revision: 1,
      sessionId: session.id,
      startMs: index * 10000,
      endMs: index * 10000 + 5000,
      text,
      speakerCluster: `S${index + 1}`,
      source: "live",
      committed: true,
    };
    const proposal: MeetingProposal = version({
      id: `80000000-0000-4000-8000-00000000000${index + 1}`,
      sessionId: session.id,
      kind: "action",
      state: "accepted",
      evidence: "observed",
      sources: [
        {
          segmentId: transcript.id,
          revision: 1,
          quote: text,
          speakerCluster: transcript.speakerCluster,
          personKey: owner,
        },
      ],
      body: {
        kind: "action",
        what: text,
        ownerPersonKey: owner,
        due: null,
        dependsOn: [],
        doneWhen: "Owner reports the check completed",
        status: "proposed",
      },
      decidedBy: IDS.advisor,
      decidedAt: now,
    });
    store.put("transcripts", transcript.id, transcript, IDS.company);
    store.put("proposals", proposal.id, proposal, IDS.company);
  }
}
/** Reachable fictional walkthrough: an assigned Pulse and its second-gate meeting. */
export function seedDemoPulse(store: Store) {
  if (store.records.meetings?.[DEMO_MEETING_ID]) return;
  const now = new Date().toISOString();
  const meeting: MeetingDefinition = version({
    id: DEMO_MEETING_ID,
    companyId: IDS.company,
    title: "Shipment handoff update",
    startsAt: null,
    minutes: 30,
    power: {
      purpose: "Share the shipment handoff status",
      outcomes: ["Shipment status known"],
      execution: "Collect updates before deciding whether to meet",
    },
    attendees: [
      { personId: IDS.participant, name: "Noah Reed", roles: ["resource"] },
    ],
    meetingType: "INFORMATIONAL",
    secondaryPhases: [],
    agenda: [
      {
        id: "shipment-status",
        title: "Shipment status update",
        minutes: 30,
        forPersonIds: [IDS.participant],
        questions: ["What changed in shipment handoffs?"],
        outcomeIds: ["shipment-status-known"],
        async: true,
      },
    ],
    gate: {
      mode: "ASYNC",
      route: "ASYNC",
      reason: "Share these updates in a Pulse.",
      requiredPersonIds: [],
      releasedPersonIds: [IDS.participant],
      liveMinutes: 0,
      asyncTopicIds: ["shipment-status"],
      judgedBy: "rules",
    },
    routeChoice: "pulse",
    state: "PREPARING",
    createdBy: IDS.advisor,
    createdAt: now,
    updatedAt: now,
  });
  const pulse: Pulse = {
    id: DEMO_PULSE_ID,
    meetingId: meeting.id,
    title: "Your shipment handoff update",
    dueAt: "2030-12-31T17:00:00.000Z",
    estimateMinutes: 3,
    perPerson: [
      {
        personId: IDS.participant,
        state: "not_started",
        questions: buildQuestions(
          [
            "What changed in your shipment work this week?",
            "Is anything blocking the dispatch queue now?",
            "Who needs to know about the next shipment handoff?",
          ],
          { advisorName: "Alex Moreno" },
        ),
      },
    ],
  };
  store.put("meetings", meeting.id, meeting, IDS.company);
  store.put("pulses", pulse.id, pulse, IDS.company);
}
