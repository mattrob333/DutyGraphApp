import type {
  MeetingDefinition,
  MeetingGateResult,
  MeetingAttendee,
  AgendaTopic,
  MeetingLifecycleState,
  AttendeeConsent,
  MeetingProposal,
  SpeakerMap,
  TranscriptSegment,
  Pulse,
  ClosingItem,
  ClosingOutcomeReview,
} from "./types.ts";
import type { MeetingType } from "../companion-judgment.ts";
export const personKey = (a: MeetingAttendee) =>
  a.personId ?? `guest:${a.guest?.name ?? a.name}`;
export function inferMeetingType(purpose: string): MeetingType {
  if (/decid|go.or.no.go|approve|launch/i.test(purpose)) return "DECISION";
  if (/problem|block|delay|fix/i.test(purpose)) return "PROBLEM_SOLVING";
  if (/brainstorm|ideas/i.test(purpose)) return "BRAINSTORMING";
  if (/team.build|connect/i.test(purpose)) return "TEAM_BUILDING";
  if (/teach|train|learn how/i.test(purpose)) return "INSTRUCTIONAL";
  return "INFORMATIONAL";
}
export function agendaFor(
  meeting: Pick<
    MeetingDefinition,
    "power" | "minutes" | "attendees" | "meetingType"
  >,
): AgendaTopic[] {
  const outcomes = meeting.power.outcomes;
  const base = Math.max(
    1,
    Math.floor(meeting.minutes / Math.max(1, outcomes.length)),
  );
  return outcomes.map((title, i) => ({
    id: `topic-${i + 1}`,
    title,
    minutes:
      i === outcomes.length - 1
        ? Math.max(1, meeting.minutes - base * i)
        : base,
    forPersonIds: meeting.attendees
      .filter((a) => a.personId)
      .map((a) => a.personId!),
    questions: [
      title.endsWith("?")
        ? title
        : `What is needed for ${title.toLowerCase()}?`,
    ],
    outcomeIds: [`outcome-${i + 1}`],
    async:
      /status|update|known|report|facts/i.test(title) &&
      !/decid|approve/i.test(title),
  }));
}
export function gateMeeting(
  m: Pick<
    MeetingDefinition,
    "power" | "attendees" | "meetingType" | "agenda" | "minutes"
  >,
  options: {
    allSatisfied?: boolean;
    contradiction?: boolean;
    model?: MeetingGateResult;
  } = {},
): MeetingGateResult {
  const people = m.attendees.flatMap((a) => (a.personId ? [a.personId] : []));
  const base: MeetingGateResult = {
    mode: "LIVE",
    route: "LIVE",
    reason: "Discuss the remaining outcomes together.",
    requiredPersonIds: people,
    releasedPersonIds: [],
    liveMinutes: m.agenda.reduce((n, t) => n + t.minutes, 0),
    asyncTopicIds: [],
    judgedBy: "rules",
  };
  const words = [m.power.purpose, ...m.power.outcomes].join(" ");
  if (
    /\b(safety|harassment|legal|personal performance|discrimination|abuse)\b/i.test(
      words,
    )
  )
    return {
      ...base,
      route: "HUMAN_ESCALATION",
      reason: "Ask an authorized person to handle this matter.",
      liveMinutes: null,
    };
  if (!m.power.purpose.trim() || !m.power.outcomes.some((x) => x.trim()))
    return {
      ...base,
      mode: "INSUFFICIENT_INFO",
      reason:
        "Say what this meeting is for and what must be true when it ends.",
      liveMinutes: null,
    };
  if (
    (m.meetingType === "DECISION" ||
      /decid|approve|go.or.no.go/i.test(words)) &&
    !m.attendees.some((a) => a.roles.includes("decision_maker"))
  )
    return {
      ...base,
      mode: "INSUFFICIENT_INFO",
      reason: "Add the person who decides.",
      liveMinutes: null,
    };
  if (options.allSatisfied)
    return {
      ...base,
      mode: "NO_MEETING",
      route: "NO_MEETING",
      reason: "The outcomes are already met.",
      requiredPersonIds: [],
      releasedPersonIds: people,
      liveMinutes: 0,
    };
  if (
    ["INFORMATIONAL", "INSTRUCTIONAL"].includes(m.meetingType ?? "") &&
    !options.contradiction &&
    !/decid|approve/i.test(words)
  )
    return {
      ...base,
      mode: "ASYNC",
      route: "ASYNC",
      reason: "Share these updates in a Pulse.",
      requiredPersonIds: [],
      releasedPersonIds: people,
      liveMinutes: 0,
      asyncTopicIds: m.agenda.map((t) => t.id),
    };
  const async = m.agenda.filter((t) => t.async),
    live = m.agenda.filter((t) => !t.async);
  if (async.length && live.length) {
    const required = people.filter(
      (id) =>
        m.attendees
          .find((a) => a.personId === id)
          ?.roles.some((r) => r !== "needs_to_know") &&
        live.some((t) => t.forPersonIds.includes(id)),
    );
    return {
      ...base,
      mode: "HYBRID",
      reason:
        "Send the updates as a Pulse, then discuss the remaining outcomes.",
      requiredPersonIds: required,
      releasedPersonIds: people.filter((id) => !required.includes(id)),
      liveMinutes: live.reduce((n, t) => n + t.minutes, 0),
      asyncTopicIds: async.map((t) => t.id),
    };
  }
  if (options.model) {
    const suggested = options.model;
    return {
      ...base,
      mode: suggested.mode,
      route: suggested.route,
      reason: suggested.reason,
      judgedBy: "model",
      asyncTopicIds: suggested.asyncTopicIds.filter((id) =>
        m.agenda.some((t) => t.id === id),
      ),
      requiredPersonIds: people.filter((id) =>
        suggested.requiredPersonIds.includes(id),
      ),
      releasedPersonIds: people.filter(
        (id) => !suggested.requiredPersonIds.includes(id),
      ),
      liveMinutes: ["ASYNC", "NO_MEETING"].includes(suggested.mode)
        ? 0
        : m.agenda
            .filter((t) => !suggested.asyncTopicIds.includes(t.id))
            .reduce((n, t) => n + t.minutes, 0),
    };
  }
  return base;
}
const main: MeetingLifecycleState[] = [
  "REQUESTED",
  "EVALUATING",
  "ROUTED",
  "PREPARING",
  "READY",
  "IN_SESSION",
  "EXTRACTING",
  "REVIEW_PENDING",
  "APPROVED",
  "COMPLETE",
];
const exception: MeetingLifecycleState[] = [
  "PAUSED",
  "RESCHEDULED",
  "CANCELLED",
  "PARTICIPANT_DISCONNECTED",
  "RECORDING_UNAVAILABLE",
  "CONSENT_WITHDRAWN",
  "NEEDS_HUMAN_FACILITATOR",
  "INSUFFICIENT_EVIDENCE",
  "TECHNICAL_FAILURE",
];
export function nextLifecycle(
  from: MeetingLifecycleState,
  to: MeetingLifecycleState,
): MeetingLifecycleState {
  if (from === to) return to;
  if (from === "CANCELLED" || from === "COMPLETE")
    throw Error("This meeting is closed.");
  if (exception.includes(to)) return to;
  if (
    exception.includes(from) &&
    ["PREPARING", "READY", "IN_SESSION"].includes(to)
  )
    return to;
  if (
    (from === "REVIEW_PENDING" && to === "PARTIALLY_APPROVED") ||
    (from === "PARTIALLY_APPROVED" && to === "COMPLETE")
  )
    return to;
  if (main.indexOf(to) !== main.indexOf(from) + 1)
    throw Error("Invalid meeting transition.");
  return to;
}
export function canRecord(
  consents: AttendeeConsent[],
  attendees: MeetingAttendee[],
): boolean {
  return (
    attendees.length > 0 &&
    attendees.every((a) =>
      consents.some(
        (c) => c.personKey === personKey(a) && c.state !== "pending",
      ),
    ) &&
    consents.some((c) => c.state === "consented")
  );
}
export function canAccept(
  p: MeetingProposal,
  segments: TranscriptSegment[],
  map: SpeakerMap,
): { ok: boolean; reason?: string } {
  if (p.state === "stale")
    return { ok: false, reason: "Check the changed source before accepting." };
  if (!p.sources.length) return { ok: false, reason: "A source is required." };
  for (const ref of p.sources) {
    const s = segments.find((x) => x.id === ref.segmentId);
    if (
      !s ||
      !s.committed ||
      s.excluded ||
      s.revision !== ref.revision ||
      !ref.quote.trim() ||
      s.speakerCluster !== ref.speakerCluster ||
      (ref.personKey !== null &&
        !map.entries.some(
          (e) =>
            e.cluster === s.speakerCluster &&
            e.confirmedBy &&
            e.personKey === ref.personKey,
        )) ||
      !s.text.includes(ref.quote)
    )
      return { ok: false, reason: "A current committed source is required." };
  }
  const attributed = [
    "claim",
    "decision",
    "action",
    "responsibility_delta",
  ].includes(p.kind);
  if (
    attributed &&
    !p.sources.some((ref) =>
      map.entries.some(
        (e) => e.cluster === ref.speakerCluster && e.personKey && e.confirmedBy,
      ),
    )
  )
    return {
      ok: false,
      reason: "Confirm the speaker before accepting this item.",
    };
  return { ok: true };
}
export function staleFromSegment(
  proposals: MeetingProposal[],
  id: string,
): MeetingProposal[] {
  return proposals.map((p) =>
    p.sources.some((s) => s.segmentId === id) ? { ...p, state: "stale" } : p,
  );
}
export function pulseDone(pulse: Pulse, now: number): boolean {
  return (
    pulse.perPerson.every((p) => p.state === "complete") ||
    Date.parse(pulse.dueAt) <= now
  );
}
export function pulseTeamStatus(pulse: Pulse, names: Record<string, string>) {
  return {
    total: pulse.perPerson.length,
    done: pulse.perPerson.filter((p) => p.state === "complete").length,
    people: pulse.perPerson.map((p) => ({
      name: names[p.personId] ?? "Participant",
      state: p.state,
    })),
  };
}
export function closingReadiness(
  outcomes: ({ met: boolean } | ClosingOutcomeReview)[],
  proposals: MeetingProposal[],
  items: ClosingItem[],
  followUpPlan?: string,
) {
  const unconfirmed = proposals.filter(
    (p) =>
      p.body.kind === "action" &&
      p.state !== "rejected" &&
      (p.state !== "accepted" ||
        !p.body.ownerPersonKey ||
        !p.body.due ||
        !Number.isFinite(Date.parse(p.body.due)) ||
        !items.some(
          (i) =>
            i.proposalId === p.id &&
            i.ownerPersonKey ===
              (p.body as { ownerPersonKey: string | null }).ownerPersonKey &&
            i.confirmation === "confirmed",
        )),
  );
  const missing = outcomes.filter((x) =>
    "met" in x
      ? !x.met
      : x.status === "deferred"
        ? !x.ownerPersonKey || !x.dueAt || !Number.isFinite(Date.parse(x.dueAt))
        : x.status === "partly_met"
          ? !followUpPlan?.trim()
          : !["met", "dropped"].includes(x.status),
  ).length;
  const reviewed = proposals.every((p) =>
    ["accepted", "rejected"].includes(p.state),
  );
  return {
    complete:
      outcomes.length > 0 &&
      missing === 0 &&
      unconfirmed.length === 0 &&
      reviewed,
    partial: !!followUpPlan?.trim(),
    missingOutcomes: missing,
    unconfirmedActions: unconfirmed.length,
  };
}

/** Approval is derived from explicit review; it never claims the meeting objectives are complete. */
export function reviewLifecycle(
  proposals: MeetingProposal[],
): MeetingLifecycleState {
  if (!proposals.length) return "REVIEW_PENDING";
  const accepted = proposals.filter((p) => p.state === "accepted");
  const reviewed = proposals.every(
    (p) => p.state === "accepted" || p.state === "rejected",
  );
  const ownersConfirmed = accepted.every(
    (p) =>
      p.body.kind !== "action" ||
      ["assigned", "accepted", "completed"].includes(p.body.status),
  );
  if (reviewed && ownersConfirmed) return "APPROVED";
  return accepted.length ? "PARTIALLY_APPROVED" : "REVIEW_PENDING";
}
