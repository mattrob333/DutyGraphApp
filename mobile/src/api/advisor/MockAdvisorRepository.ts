import {
  agendaFor,
  gateMeeting,
  inferMeetingType,
  canAccept,
  staleFromSegment,
  closingReadiness,
} from "../../../../shared/meetings/rules";
import { newId } from "@/utils/id";
import type {
  AdvisorRepository,
  AdvisorSession,
  CreateMeeting,
  MeetingDefinition,
  MeetingSession,
  SessionDetail,
  Person,
  MeetingProposal,
  PulseStatus,
  Coach,
  Trigger,
  ClosingItem,
  SaveClosing,
  MeetingGateSuggestionWire,
  MeetingTaskCardWire,
} from "./types";
import type {
  SpeakerMap,
  KickoffNote,
  SetupProposal,
} from "../../../../shared/meetings/types";
const copy = <T>(value: T): T =>
  value === undefined ? value : JSON.parse(JSON.stringify(value));
export const DEMO_PEOPLE: Person[] = [
  { id: "dana", name: "Dana Whitlock", role: "COO", department: "Operations" },
  {
    id: "priya",
    name: "Priya Shah",
    role: "IT lead",
    department: "Technology",
  },
  {
    id: "marcus",
    name: "Marcus Lee",
    role: "Warehouse lead",
    department: "Operations",
  },
];
const now = () => new Date().toISOString();
const problem = (message: string): never => {
  throw new Error(message);
};
/** Fictional, isolated repository. No network and no audio recording. */
export class MockAdvisorRepository implements AdvisorRepository {
  readonly kind = "mock" as const;
  async voiceLines() {
    return { lines: [] };
  }
  private records = new Map<string, MeetingDefinition>();
  private sessions = new Map<string, SessionDetail>();
  private commands = new Map<string, { body: string; result: unknown }>();
  private pulses = new Map<string, PulseStatus>();
  private noteRecords = new Map<string, KickoffNote[]>();
  private taskCardRecords = new Map<string, MeetingTaskCardWire>();
  constructor() {
    this.seed();
  }
  private seed() {
    const title = "Confirm the shipping date";
    this.taskCardRecords.set("task-demo-shipping", {
      id: "task-demo-shipping",
      title,
      version: 1,
      hash: "mock-task-demo-shipping-1",
      state: "active",
      data: {
        title,
        duty: "Coordinate shipping",
        ownerId: "priya",
        performerId: "priya",
        purpose: "Confirm when the order can ship",
        trigger: "Order ready",
        inputs: "Order details",
        instructions: "Check the carrier schedule",
        output: "Confirmed shipping date",
        systems: ["Dispatch board"],
        humanGate: "Dana approves",
        destination: "Warehouse",
        mode: "human",
      },
    });

    const meeting = this.make(
      {
        title: "Weekly operations review",
        startsAt: null,
        minutes: 25,
        purpose: "Decide whether the carrier rollout is ready.",
        outcomes: ["A launch decision", "An owner and date for credentials"],
        execution: "Review the blockers, decide, then confirm each action.",
        attendees: DEMO_PEOPLE.map((p, i) => ({
          personId: p.id,
          name: p.name,
          roles: [
            i === 0 ? "decision_maker" : i === 1 ? "resource" : "executor",
          ],
        })),
      },
      "demo-operations",
    );
    this.records.set(meeting.id, meeting);
  }
  private run<T>(key: string, body: unknown, operation: () => T): T {
    if (!key) return problem("A retry key is required.");
    const serialized = JSON.stringify(body),
      previous = this.commands.get(key);
    if (previous) {
      if (previous.body !== serialized)
        return problem("This retry key belongs to another change.");
      return copy(previous.result as T);
    }
    const result = operation();
    this.commands.set(key, { body: serialized, result: copy(result ?? null) });
    return copy(result);
  }
  private make(input: CreateMeeting, id = newId()): MeetingDefinition {
    if (
      !input.title.trim() ||
      !input.purpose.trim() ||
      !input.outcomes.some((o) => o.trim())
    )
      return problem("Add a title, purpose and outcome.");
    return {
      id,
      companyId: "larkspur",
      version: 1,
      hash: `mock-${id}-1`,
      title: input.title,
      ...(input.previousMeetingId
        ? { previousMeetingId: input.previousMeetingId }
        : {}),
      startsAt: input.startsAt,
      minutes: input.minutes,
      power: {
        purpose: input.purpose,
        outcomes: input.outcomes,
        execution: input.execution,
      },
      attendees: input.attendees,
      meetingType: input.meetingType ?? null,
      secondaryPhases: [],
      agenda: input.agenda ?? [],
      gate: null,
      routeChoice: null,
      state: "REQUESTED",
      createdBy: "alex",
      createdAt: now(),
      updatedAt: now(),
    };
  }
  private get(id: string) {
    return this.records.get(id) ?? problem("Meeting was not found.");
  }
  private live(id: string) {
    return this.sessions.get(id) ?? problem("Session was not found.");
  }
  private revise(m: MeetingDefinition) {
    m.version++;
    m.hash = `mock-${m.id}-${m.version}`;
    m.updatedAt = now();
  }
  async pair(code: string, key: string): Promise<AdvisorSession> {
    return this.run(key, { code }, () => {
      if (code !== "DEMO") return problem("Use DEMO to open fictional data.");
      return {
        accessToken: "demo-advisor",
        refreshToken: "demo-refresh",
        accessExpiresAt: new Date(Date.now() + 900000).toISOString(),
        expiresAt: new Date(Date.now() + 2592000000).toISOString(),
        advisor: { id: "alex", name: "Alex Moreno" },
        company: { id: "larkspur", name: "Larkspur Supply" },
        role: "advisor_mobile",
      };
    });
  }
  async logout() {}
  async people() {
    return copy(DEMO_PEOPLE);
  }
  async taskCards() {
    return copy([...this.taskCardRecords.values()]);
  }
  async taskCard(id: string) {
    return copy(
      this.taskCardRecords.get(id) ?? problem("Task Card was not found."),
    );
  }
  async meetings() {
    return copy([...this.records.values()]);
  }
  async meeting(id: string) {
    return copy(this.get(id));
  }
  async create(input: CreateMeeting, key: string) {
    return this.run(key, input, () => {
      let next = input;
      if (input.previousMeetingId) {
        const previous = this.get(input.previousMeetingId);
        if (previous.state !== "COMPLETE")
          return problem(
            "Complete the previous meeting before carrying deferred work.",
          );
        const previousSession = [...this.sessions.values()].find(
          (session) => session.meetingId === previous.id,
        );
        const carried = (previousSession?.outcomeReviews ?? [])
          .filter((review) => review.status === "deferred")
          .map((review) => ({
            review,
            title:
              previous.power.outcomes[
                Number(review.outcomeId.replace("outcome-", "")) - 1
              ],
          }))
          .filter((item) => !!item.title);
        next = {
          ...input,
          outcomes: [...input.outcomes, ...carried.map((item) => item.title)],
          agenda: [
            ...(input.agenda ?? []),
            ...carried.map((item, index) => ({
              id: `deferred-${previous.id}-${index + 1}`,
              title: item.title,
              minutes: 5,
              forPersonIds: item.review.ownerPersonKey
                ? [item.review.ownerPersonKey]
                : [],
              questions: [`Follow up by ${item.review.dueAt}`],
              outcomeIds: [`outcome-${input.outcomes.length + index + 1}`],
              async: false,
            })),
          ],
        };
      }
      const m = this.make(next);
      this.records.set(m.id, m);
      return m;
    });
  }
  async patch(
    id: string,
    patch: Partial<CreateMeeting> & { expectedVersion: number },
    key: string,
  ) {
    return this.run(key, { id, patch }, () => {
      const m = this.get(id);
      if (m.version !== patch.expectedVersion)
        return problem("This plan changed. Reload it and try again.");
      for (const field of [
        "title",
        "startsAt",
        "minutes",
        "attendees",
        "agenda",
        "meetingType",
      ] as const)
        if (patch[field] !== undefined)
          Object.assign(m, { [field]: patch[field] });
      if (patch.purpose !== undefined) m.power.purpose = patch.purpose;
      if (patch.outcomes) m.power.outcomes = patch.outcomes;
      if (patch.execution !== undefined) m.power.execution = patch.execution;
      this.revise(m);
      return m;
    });
  }
  async plan(id: string, key: string) {
    return this.run(key, { id }, () => {
      const m = this.get(id);
      m.meetingType = inferMeetingType(m.power.purpose);
      m.agenda = m.agenda.length ? m.agenda : agendaFor(m);
      m.gate = gateMeeting(m);
      m.state = "ROUTED";
      this.revise(m);
      return m;
    });
  }

  async gateSuggestion(
    id: string,
    key: string,
  ): Promise<MeetingGateSuggestionWire> {
    return this.run(key, { id, operation: "gate-suggestion" }, () => ({
      deterministic: gateMeeting(this.get(id)),
      suggestion: null,
      status: "off",
    }));
  }
  async route(
    id: string,
    choice: "pulse" | "shorter" | "as_planned",
    key: string,
  ) {
    return this.run(key, { id, choice }, () => {
      const m = this.get(id);
      if (
        m.gate?.mode === "INSUFFICIENT_INFO" ||
        m.gate?.route === "HUMAN_ESCALATION"
      )
        return problem(m.gate.reason);
      m.routeChoice = choice;
      m.state = "PREPARING";
      if (choice === "shorter")
        m.minutes = m.gate?.liveMinutes || Math.min(25, m.minutes);
      this.revise(m);
      return m;
    });
  }
  async pulse(id: string, create = false, key = "") {
    if (create)
      return this.run(key, { id }, () => {
        const m = this.get(id);
        const p: PulseStatus = {
          id: `pulse-${id}`,
          total: m.attendees.length,
          done: 0,
          people: m.attendees.map((a) => ({
            name: a.name,
            state: "not_started",
          })),
        };
        this.pulses.set(id, p);
        return p;
      });
    return copy(this.pulses.get(id) ?? { total: 0, done: 0, people: [] });
  }
  async start(
    id: string,
    mode: MeetingSession["mode"],
    key: string,
    voice: "tts_lines" | "realtime" = "tts_lines",
  ) {
    return this.run(key, { id, mode, voice }, () => {
      const m = this.get(id);
      const gate = gateMeeting({
        ...m,
        meetingType: m.meetingType ?? inferMeetingType(m.power.purpose),
      });
      if (
        !m.attendees.length ||
        gate.mode === "INSUFFICIENT_INFO" ||
        gate.route === "HUMAN_ESCALATION"
      )
        return problem(gate.reason);
      const sid = newId();
      const s: SessionDetail = {
        id: sid,
        companyId: "larkspur",
        version: 1,
        hash: `mock-${sid}-1`,
        meetingId: id,
        mode,
        voice: mode === "facilitator" ? "simulated" : null,
        facilitatorState: "OPEN",
        currentTopicId: m.agenda[0]?.id ?? null,
        topicStartedAt: null,
        consents: m.attendees.map((a, i) => ({
          personKey: a.personId ?? `guest-${i}`,
          name: a.name,
          state: "pending",
          at: null,
        })),
        noticeVersion: "draft-1",
        appVersion: "0.1.0",
        startedAt: null,
        endedAt: null,
        promptVersion: null,
        promptHash: null,
        budgetCents: 200,
        spentCents: 0,
        log: [],
        transcript: [],
        parked: [],
        speakerMap: { sessionId: sid, entries: [] },
        proposals: [],
        closing: [],
      };
      this.sessions.set(sid, s);
      return s;
    });
  }
  async realtime(): Promise<
    import("@/features/voice/meeting/realtime/types").RealtimeGrant
  > {
    return { available: false, reason: "DEMO_USES_SPOKEN_LINES" };
  }
  private readiness(s: SessionDetail) {
    const meeting = this.get(s.meetingId);
    const reviews = meeting.power.outcomes.map(
      (_, index) =>
        s.outcomeReviews?.find(
          (review) => review.outcomeId === `outcome-${index + 1}`,
        ) ?? { met: false },
    );
    return closingReadiness(
      reviews,
      s.proposals,
      s.closing ?? [],
      s.followUpPlan,
    );
  }
  private reviseSession(s: SessionDetail) {
    s.version++;
    s.hash = `mock-${s.id}-${s.version}`;
  }
  async session(id: string) {
    const s = this.live(id);
    return copy({ ...s, closingReadiness: this.readiness(s) });
  }
  async consent(
    id: string,
    attendees: MeetingSession["consents"],
    key: string,
  ) {
    return this.run(key, { id, attendees }, () => {
      const s = this.live(id);
      if (!attendees.length || attendees.some((a) => a.state === "pending"))
        return problem("Ask every attendee to consent or decline.");
      if (!attendees.some((a) => a.state === "consented"))
        return problem("At least one attendee must consent.");
      s.consents = attendees;
      s.startedAt = now();
      s.topicStartedAt = now();
      this.get(s.meetingId).state = "IN_SESSION";
      return s;
    });
  }
  async transcript(
    id: string,
    segments: import("./types").TranscriptInput[],
    key: string,
  ) {
    this.run(key, { id, segments }, () => {
      const s = this.live(id);
      if (!s.startedAt) return problem("Consent is required first.");
      for (const segment of segments) {
        if (
          segment.personKey &&
          !s.consents.some(
            (c) => c.personKey === segment.personKey && c.state === "consented",
          )
        )
          return problem("Choose a consenting speaker first.");
      }
      for (const input of segments) {
        const { personKey, ...segment } = input;
        if (personKey) {
          segment.speakerCluster = `N_${segment.id}`;
          s.speakerMap.entries = s.speakerMap.entries.filter(
            (e) => e.cluster !== segment.speakerCluster,
          );
          s.speakerMap.entries.push({
            cluster: segment.speakerCluster,
            personKey,
            suggested: false,
            confirmedBy: "leader",
          });
        }
        const previous = s.transcript.findIndex((t) => t.id === segment.id);
        if (previous >= 0) {
          if (segment.revision <= s.transcript[previous].revision) continue;
          s.transcript[previous] = segment;
          for (const p of s.proposals)
            if (p.sources.some((ref) => ref.segmentId === segment.id))
              p.state = "stale";
        } else s.transcript.push(segment);
      }
    });
  }
  async coach(id: string): Promise<Coach> {
    const s = this.live(id),
      m = this.get(s.meetingId);
    return {
      nextQuestion:
        m.agenda.find((a) => a.id === s.currentTopicId)?.questions[0] ??
        "Which outcome still needs an answer?",
      stillNeeded: m.power.outcomes,
      flags: s.transcript.length
        ? ["Confirm an owner and date before closing."]
        : [],
    };
  }
  async park(id: string, text: string, atMs: number, key: string) {
    this.run(key, { id, text, atMs }, () => {
      this.live(id).parked.push({
        id: newId(),
        sessionId: id,
        text,
        speakerCluster: null,
        atMs,
        followUp: null,
      });
    });
  }
  async turn(id: string, trigger: Trigger, key: string) {
    return this.run(key, { id, trigger }, () => ({
      text:
        trigger === "opening"
          ? "I am the DutyGraph assistant. Please each say your name and role."
          : trigger === "closing"
            ? "Let us check the decisions, owners and dates before we finish."
            : "What is still needed for this outcome?",
      action: trigger === "closing" ? "RECOMMEND_CLOSURE" : "ASK_QUESTION",
      promptVersion: "mock-1",
    }));
  }
  async state(id: string, to: string, key: string) {
    this.run(key, { id, to }, () => {
      const s = this.live(id);
      if (to === "COMPLETE" && this.get(s.meetingId).state !== "COMPLETE")
        return problem("Complete the closing review first.");
      s.log.push({ at: now(), actor: "leader", kind: to });
      if (to === "NEXT_TOPIC") {
        const agenda = this.get(s.meetingId).agenda;
        const next = agenda.findIndex((a) => a.id === s.currentTopicId) + 1;
        s.currentTopicId = agenda[next]?.id ?? null;
        s.topicStartedAt = now();
      }
    });
  }
  async control(
    id: string,
    control: "mute" | "unmute" | "stop" | "skip",
    key: string,
  ) {
    this.run(key, { id, control }, () => {
      this.live(id).log.push({
        at: now(),
        actor: "leader",
        kind: {
          mute: "ai_muted",
          unmute: "ai_unmuted",
          stop: "ai_stopped",
          skip: "ai_skipped",
        }[control],
      });
    });
  }
  async topic(id: string, topicId: string | null, key: string) {
    this.run(key, { id, topicId }, () => {
      const s = this.live(id);
      s.currentTopicId = topicId;
      s.topicStartedAt = now();
    });
  }
  async uploadSegment(): Promise<{ uploadedBytes: number }> {
    return problem("Demo mode does not record or upload audio.");
  }
  async finish(id: string, key: string) {
    this.run(key, { id }, () => {
      const s = this.live(id);
      if (!s.transcript.some((t) => t.committed && !t.excluded))
        return problem("Add a confirmed note or transcript before finishing.");
      if (
        s.consents.some((person) => person.state === "declined") &&
        s.transcript.some(
          (segment) =>
            segment.committed &&
            !segment.excluded &&
            !s.speakerMap.entries.some(
              (entry) =>
                entry.cluster === segment.speakerCluster &&
                entry.personKey &&
                entry.confirmedBy,
            ),
        )
      )
        return problem(
          "Map or remove unknown speakers before extracting proposals.",
        );
      s.endedAt = now();
      this.get(s.meetingId).state = "REVIEW_PENDING";
      s.speakerMap.entries = [
        ...new Set(
          s.transcript
            .map((t) => t.speakerCluster)
            .filter((v): v is string => !!v),
        ),
      ].map(
        (cluster) =>
          s.speakerMap.entries.find((entry) => entry.cluster === cluster) ?? {
            cluster,
            personKey: null,
            suggested: false,
            confirmedBy: null,
          },
      );
      if (!s.proposals.length)
        s.proposals = s.transcript
          .filter((t) => t.committed && !t.excluded)
          .map((t) => ({
            id: newId(),
            sessionId: id,
            kind: "claim",
            state: "proposed",
            version: 1,
            hash: `mock-${t.id}`,
            sources: [
              {
                segmentId: t.id,
                revision: t.revision,
                quote: t.text,
                speakerCluster: t.speakerCluster,
                personKey: null,
              },
            ],
            evidence: "observed",
            body: { kind: "claim", fieldPath: "meeting.notes", value: t.text },
            decidedBy: null,
            decidedAt: null,
          }));
    });
  }
  async speakers(id: string, map: SpeakerMap, key: string) {
    return this.run(key, { id, map }, () => {
      const s = this.live(id);
      s.speakerMap = map;
      for (const p of s.proposals)
        for (const ref of p.sources)
          ref.personKey =
            map.entries.find(
              (e) => e.cluster === ref.speakerCluster && e.confirmedBy,
            )?.personKey ?? null;
      return map;
    });
  }
  async decide(
    proposal: MeetingProposal,
    decision: "accept" | "reject" | "edit",
    key: string,
    body?: MeetingProposal["body"],
  ) {
    return this.run(key, { proposal, decision, body }, () => {
      const s = this.live(proposal.sessionId),
        p =
          s.proposals.find((v) => v.id === proposal.id) ??
          problem("Proposal was not found.");
      if (p.draftRecordId && !(p.state === "stale" && decision === "reject"))
        return problem(
          "This proposal already created a saved draft. Review the draft record for further changes.",
        );
      if (this.get(s.meetingId).state === "COMPLETE")
        return problem("This meeting is complete.");
      if (p.version !== proposal.version)
        return problem("This proposal changed. Reload it.");
      if (decision === "accept") {
        const allowed = canAccept(p, s.transcript, s.speakerMap);
        if (!allowed.ok)
          return problem(
            allowed.reason ?? "Check the source before accepting.",
          );
        if (p.body.kind === "task_card_delta") {
          const change = p.body,
            meeting = this.get(s.meetingId);
          if (
            !change.personKey ||
            !meeting.attendees.some(
              (person) => person.personId === change.personKey,
            )
          )
            return problem("Choose a named attendee whose work changes.");
          if (
            change.field === "ownerId" &&
            !meeting.attendees.some((person) => person.personId === change.to)
          )
            return problem("Choose a named attendee as owner.");
          const target = change.taskCardId
            ? (this.taskCardRecords.get(change.taskCardId) ??
              problem("Task Card was not found."))
            : null;
          const draftId = newId(),
            title =
              change.field === "title"
                ? change.to
                : (target?.title ?? "Proposed Task Card change");
          const data = target
            ? copy(target.data)
            : {
                title,
                duty: "",
                ownerId: change.personKey,
                performerId: change.personKey,
                purpose: "",
                trigger: "",
                inputs: "",
                instructions: "",
                output: "",
                systems: [] as string[],
                humanGate: "",
                destination: "",
                mode: "human",
              };
          if (change.field === "systems")
            data.systems = change.to
              .split("\n")
              .map((value) => value.trim())
              .filter(Boolean);
          else Object.assign(data, { [change.field]: change.to });
          data.title = title;
          this.taskCardRecords.set(draftId, {
            id: draftId,
            title,
            version: 1,
            hash: `mock-${draftId}-1`,
            state: "proposed",
            data,
          });
          p.draftRecordId = draftId;
        }
        p.sources = p.sources.map((ref) => ({
          ...ref,
          personKey:
            s.speakerMap.entries.find(
              (entry) =>
                entry.cluster === ref.speakerCluster && entry.confirmedBy,
            )?.personKey ?? null,
        }));
      }
      if (decision === "edit") {
        if (body?.kind === "task_card_delta") {
          const meeting = this.get(s.meetingId);
          if (
            !body.personKey ||
            !meeting.attendees.some(
              (person) => person.personId === body.personKey,
            )
          )
            return problem("Choose a named attendee whose work changes.");
          if (body.taskCardId && !this.taskCardRecords.has(body.taskCardId))
            return problem("Task Card was not found.");
          if (
            body.field === "ownerId" &&
            !meeting.attendees.some((person) => person.personId === body.to)
          )
            return problem("Choose a named attendee as owner.");
        }

        if (
          !proposal.sources.length ||
          proposal.sources.some((ref) => {
            const segment = s.transcript.find(
              (item) => item.id === ref.segmentId,
            );
            return (
              !segment ||
              !segment.committed ||
              !!segment.excluded ||
              segment.revision !== ref.revision ||
              segment.speakerCluster !== ref.speakerCluster ||
              !ref.quote.trim() ||
              !segment.text.includes(ref.quote)
            );
          })
        )
          return problem("Check the current source before editing.");
        if (body && body.kind !== p.kind)
          return problem("Keep the proposal kind when editing.");
        p.sources = copy(proposal.sources);
        if (body) p.body = body;
      }
      s.closing = (s.closing ?? []).filter((item) => item.proposalId !== p.id);
      this.reviseSession(s);
      p.state =
        decision === "accept"
          ? "accepted"
          : decision === "reject"
            ? "rejected"
            : "proposed";
      p.version++;
      p.hash = `mock-${p.id}-${p.version}`;
      p.decidedBy = "alex";
      p.decidedAt = now();
      return p;
    });
  }
  async confirm(id: string, item: ClosingItem, key: string) {
    this.run(key, { id, item }, () => {
      const s = this.live(id);
      if (this.get(s.meetingId).state === "COMPLETE")
        return problem("This meeting is complete.");
      const current = s.proposals.find((p) => p.id === item.proposalId);
      if (
        !current ||
        (item.expectedVersion !== undefined &&
          item.expectedVersion !== current.version) ||
        (item.contentHash !== undefined && item.contentHash !== current.hash)
      )
        return problem("The proposal changed. Reload it.");
      s.closing = [
        ...(s.closing ?? []).filter((i) => i.proposalId !== item.proposalId),
        item,
      ];
      const p = s.proposals.find((p) => p.id === item.proposalId);
      if (
        p?.body.kind === "action" &&
        item.confirmation === "confirmed" &&
        item.ownerPersonKey === p.body.ownerPersonKey
      )
        p.body.status = "assigned";
      this.reviseSession(s);
    });
  }
  async saveClosing(id: string, input: SaveClosing, key: string) {
    this.run(key, { id, input }, () => {
      const s = this.live(id),
        meeting = this.get(s.meetingId);
      if (meeting.state === "COMPLETE")
        return problem("This meeting is complete.");
      if (s.version !== input.expectedVersion || s.hash !== input.contentHash)
        return problem("The closing review changed. Reload it.");
      const allowed = new Set(
        meeting.power.outcomes.map((_, index) => `outcome-${index + 1}`),
      );
      const seen = new Set<string>();
      for (const review of input.outcomes) {
        if (!allowed.has(review.outcomeId) || seen.has(review.outcomeId))
          return problem("Review each current outcome once.");
        seen.add(review.outcomeId);
        if (
          !["met", "partly_met", "deferred", "dropped"].includes(review.status)
        )
          return problem("Choose an outcome status.");
        if (
          review.status === "deferred" &&
          (!s.consents.some(
            (person) =>
              person.personKey === review.ownerPersonKey &&
              person.state === "consented",
          ) ||
            !Number.isFinite(Date.parse(review.dueAt ?? "")))
        )
          return problem("Deferred work needs an attendee owner and date.");
        if (review.status === "partly_met" && !input.followUpPlan?.trim())
          return problem("Add a follow-up plan for partly met outcomes.");
      }
      s.outcomeReviews = copy(input.outcomes);
      s.followUpPlan = input.followUpPlan;
      this.reviseSession(s);
    });
  }
  async complete(
    id: string,
    reviewed: { expectedVersion: number; contentHash: string },
    key: string,
  ) {
    return this.run(key, { id, reviewed }, () => {
      const s = this.live(id),
        meeting = this.get(s.meetingId);
      if (meeting.state === "COMPLETE") return meeting;
      if (
        s.version !== reviewed.expectedVersion ||
        s.hash !== reviewed.contentHash
      )
        return problem("The closing review changed. Reload it.");
      if (!s.endedAt || !this.readiness(s).complete)
        return problem(
          "Review outcomes, proposals, action owners, dates and confirmations before completing.",
        );
      meeting.state = "COMPLETE";
      this.revise(meeting);
      this.reviseSession(s);
      return meeting;
    });
  }
  async followUp(id: string, personId: string, key: string) {
    this.run(key, { id, personId }, () => ({ requestId: newId() }));
  }
  async export(id: string) {
    const s = this.live(id);
    return {
      markdown: `# ${this.get(s.meetingId).title}\n\n${s.proposals.map((p) => `- ${p.state}: ${JSON.stringify(p.body)}`).join("\n")}`,
      json: copy(s),
    };
  }
  async audioSource() {
    return null;
  }
  async notes(id: string, notes: KickoffNote[], key: string) {
    this.run(key, { id, notes }, () => {
      if (notes.length > 80 || notes.some((n) => n.text.length > 6000))
        return problem("Keep up to 80 notes, each under 6000 characters.");
      this.noteRecords.set(id, copy(notes));
    });
  }
  async setup(key: string) {
    return this.run(key, {}, () => ({ id: newId() }));
  }
  async understandSetup(
    id: string,
    answers: Record<string, string>,
    key: string,
  ): Promise<SetupProposal[]> {
    return this.run(key, { id, answers }, () =>
      Object.entries(answers)
        .filter(([, v]) => v.trim())
        .map(([fieldPath, value]) => ({
          fieldPath,
          value,
          quote: value,
          missingFields: [],
          source: "owner_supplied" as const,
        })),
    );
  }
  async confirmSetup(id: string, proposals: SetupProposal[], key: string) {
    this.run(key, { id, proposals }, () => ({ confirmed: true }));
  }
}
