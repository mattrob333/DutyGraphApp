import { Store, IDS, version } from "./core.ts";
import { buildQuestions } from "../../shared/hands-free/hints.ts";
import type { MeetingDefinition, Pulse } from "../../shared/meetings/types.ts";
export const DEMO_MEETING_ID = "50000000-0000-4000-8000-000000000001";
export const DEMO_PULSE_ID = "60000000-0000-4000-8000-000000000001";
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
