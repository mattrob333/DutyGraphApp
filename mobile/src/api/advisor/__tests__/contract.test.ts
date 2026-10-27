import { beforeEach, expect, it, jest } from "@jest/globals";
jest.mock("@/features/voice/out", () => ({
  clearVoiceAudioCache: jest.fn(async () => {}),
}));
jest.mock("@/features/voice/meeting", () => ({
  clearMeetingRecordingData: jest.fn(async () => {}),
}));
jest.mock("expo-secure-store", () => {
  const { secureMap } = require("../../http/testUtils");
  return {
    AFTER_FIRST_UNLOCK: 1,
    getItemAsync: async (key: string) => secureMap.get(key) ?? null,
    setItemAsync: async (key: string, value: string) =>
      void secureMap.set(key, value),
    deleteItemAsync: async (key: string) => void secureMap.delete(key),
  };
});
import { HttpAdvisorRepository } from "../HttpAdvisorRepository";
import type { AdvisorSession, MeetingProposal, CreateMeeting } from "../types";
import { advisorTokens } from "@/storage/advisor";
const Ajv = require("ajv/dist/2020").default;
const formats = require("ajv-formats").default;
const contract = require("../../../../../contracts/meeting-mobile.openapi.json");
const ajv = new Ajv({ strict: false, allErrors: true });
formats(ajv);
const personId = "8d6d335c-e7f0-4c91-a35b-0c264787ed66",
  meetingId = "3623c52b-fda2-44d0-8f76-308ec3989d56",
  sessionId = "8a21c5f2-68c7-40a6-a406-78ef215d78df",
  proposalId = "8d0a667f-00e3-4eb4-b1ec-455195092078";
const session: AdvisorSession = {
  accessToken: "access",
  refreshToken: "refresh",
  accessExpiresAt: new Date(Date.now() + 900000).toISOString(),
  expiresAt: new Date(Date.now() + 2592000000).toISOString(),
  advisor: { id: personId, name: "Alex Moreno" },
  company: { id: "d21a5c3b-c75b-4aa6-9b70-f49c0214f3b0", name: "Larkspur" },
  role: "advisor_mobile",
};
const input: CreateMeeting = {
  title: "Launch decision",
  startsAt: null,
  minutes: 25,
  purpose: "Decide the launch date",
  outcomes: ["A date"],
  execution: "Confirm the owner",
  attendees: [{ personId, name: "Dana Whitlock", roles: ["decision_maker"] }],
};
const proposal: MeetingProposal = {
  id: proposalId,
  sessionId,
  kind: "claim",
  state: "proposed",
  version: 1,
  hash: "a".repeat(64),
  sources: [
    {
      segmentId: proposalId,
      revision: 1,
      quote: "Words",
      speakerCluster: "S1",
      personKey: personId,
    },
  ],
  evidence: "observed",
  body: { kind: "claim", fieldPath: "company.notes", value: "Words" },
  decidedBy: null,
  decidedAt: null,
};
beforeEach(async () => {
  await advisorTokens.set(session);
  jest.restoreAllMocks();
});
const cases: {
  name: string;
  path: string;
  method: string;
  execute(r: HttpAdvisorRepository): Promise<unknown>;
}[] = [
  {
    name: "pair",
    path: "/advisor/pair",
    method: "post",
    execute: (r) => r.pair("PAIRING-CODE", "key"),
  },
  {
    name: "create",
    path: "/meetings",
    method: "post",
    execute: (r) => r.create(input, "key"),
  },
  {
    name: "patch",
    path: "/meetings/{id}",
    method: "patch",
    execute: (r) =>
      r.patch(meetingId, { expectedVersion: 1, minutes: 20 }, "key"),
  },
  {
    name: "plan",
    path: "/meetings/{id}/plan",
    method: "post",
    execute: (r) => r.plan(meetingId, "key"),
  },
  {
    name: "route",
    path: "/meetings/{id}/route",
    method: "post",
    execute: (r) => r.route(meetingId, "as_planned", "key"),
  },
  {
    name: "pulse",
    path: "/meetings/{id}/pulse",
    method: "post",
    execute: (r) => r.pulse(meetingId, true, "key"),
  },
  {
    name: "start",
    path: "/meetings/{id}/sessions",
    method: "post",
    execute: (r) => r.start(meetingId, "copilot", "key"),
  },
  {
    name: "consent",
    path: "/sessions/{id}/consent",
    method: "post",
    execute: (r) =>
      r.consent(
        sessionId,
        [
          {
            personKey: personId,
            name: "Dana",
            state: "consented",
            at: new Date().toISOString(),
          },
        ],
        "key",
      ),
  },
  {
    name: "transcript",
    path: "/sessions/{id}/transcript",
    method: "post",
    execute: (r) =>
      r.transcript(
        sessionId,
        [
          {
            sessionId,
            id: proposalId,
            revision: 1,
            startMs: 0,
            endMs: 1000,
            text: "Words",
            speakerCluster: `N_${proposalId}`,
            personKey: personId,
            source: "live",
            committed: true,
          },
        ],
        "key",
      ),
  },
  {
    name: "coach",
    path: "/sessions/{id}/coach",
    method: "post",
    execute: (r) => r.coach(sessionId, "key"),
  },
  {
    name: "park",
    path: "/sessions/{id}/park",
    method: "post",
    execute: (r) => r.park(sessionId, "Open question", 1000, "key"),
  },
  {
    name: "facilitator",
    path: "/sessions/{id}/facilitator/turn",
    method: "post",
    execute: (r) => r.turn(sessionId, "leader_next", "key"),
  },
  {
    name: "state",
    path: "/sessions/{id}/state",
    method: "post",
    execute: (r) => r.state(sessionId, "COLLECT", "key"),
  },
  {
    name: "topic",
    path: "/sessions/{id}/topic",
    method: "post",
    execute: (r) => r.topic(sessionId, "topic-2", "key"),
  },
  {
    name: "finish",
    path: "/sessions/{id}/finish",
    method: "post",
    execute: (r) => r.finish(sessionId, "key"),
  },
  {
    name: "speakers",
    path: "/sessions/{id}/speakers",
    method: "post",
    execute: (r) =>
      r.speakers(
        sessionId,
        {
          sessionId,
          entries: [
            {
              cluster: "S1",
              personKey: personId,
              suggested: false,
              confirmedBy: personId,
            },
          ],
        },
        "key",
      ),
  },
  {
    name: "accept",
    path: "/proposals/{id}/decision",
    method: "post",
    execute: (r) => r.decide(proposal, "accept", "key"),
  },
  {
    name: "edit",
    path: "/proposals/{id}/decision",
    method: "post",
    execute: (r) =>
      r.decide(proposal, "edit", "key", {
        ...proposal.body,
        kind: "claim",
        fieldPath: "company.notes",
        value: "Edited",
      }),
  },
  {
    name: "closing",
    path: "/sessions/{id}/closing",
    method: "post",
    execute: (r) =>
      r.confirm(
        sessionId,
        { proposalId, ownerPersonKey: personId, confirmation: "confirmed" },
        "key",
      ),
  },
  {
    name: "follow-up",
    path: "/proposals/{id}/follow-up",
    method: "post",
    execute: (r) => r.followUp(proposalId, personId, "key"),
  },
  {
    name: "notes",
    path: "/kickoff/{meetingId}/notes",
    method: "post",
    execute: (r) =>
      r.notes(
        meetingId,
        [
          {
            id: proposalId,
            meetingId,
            topicId: "business",
            speakerPersonId: personId,
            text: "We distribute parts.",
            at: new Date().toISOString(),
          },
        ],
        "key",
      ),
  },
  {
    name: "setup",
    path: "/setup",
    method: "post",
    execute: (r) => r.setup("key"),
  },
  {
    name: "understand setup",
    path: "/setup/{id}/understand",
    method: "post",
    execute: (r) =>
      r.understandSetup(
        meetingId,
        { businessType: "We distribute parts." },
        "key",
      ),
  },
  {
    name: "confirm setup",
    path: "/setup/{id}/confirm",
    method: "post",
    execute: (r) =>
      r.confirmSetup(
        meetingId,
        [
          {
            fieldPath: "company.type",
            value: "Distribution",
            quote: "We distribute parts.",
            missingFields: [],
            source: "owner_supplied",
          },
        ],
        "key",
      ),
  },
  {
    name: "logout",
    path: "/advisor/session/logout",
    method: "post",
    execute: (r) => r.logout("key"),
  },
];
cases.push(
  {
    name: "realtime voice session",
    path: "/meetings/{id}/sessions",
    method: "post",
    execute: (repository) =>
      repository.start(meetingId, "facilitator", "key", "realtime"),
  },
  {
    name: "realtime SDP and bounded summary",
    path: "/sessions/{id}/realtime",
    method: "post",
    execute: (repository) =>
      repository.realtime(
        sessionId,
        {
          sdp: "v=0\naudio-only-offer",
          summary: "Current topic and confirmed context.",
        },
        "key",
      ),
  },
  {
    name: "AI stop control",
    path: "/sessions/{id}/state",
    method: "post",
    execute: (repository) => repository.control(sessionId, "stop", "key"),
  },
);
it.each(cases)(
  "validates the actual $name adapter body against the independent OpenAPI schema",
  async ({ path, method, execute }) => {
    const operation =
      contract.paths[`/api/mobile/meetings/v1${path}`]?.[method];
    expect(operation).toBeDefined();
    const schema = operation.requestBody?.content?.["application/json"]?.schema;
    const validate = schema
      ? ajv.compile({ ...schema, components: contract.components })
      : null;
    jest.spyOn(global, "fetch").mockImplementation(async (_url, options) => {
      const body = JSON.parse(String(options?.body));
      if (validate)
        expect({ valid: validate(body), errors: validate.errors }).toEqual({
          valid: true,
          errors: null,
        });
      expect(
        (options!.headers as Record<string, string>)["Idempotency-Key"],
      ).toBe("key");
      return {
        status: 200,
        ok: true,
        text: async () =>
          JSON.stringify({
            ...session,
            meeting: {},
            flags: [],
            proposals: [],
            total: 0,
            done: 0,
            people: [],
          }),
      } as Response;
    });
    await execute(new HttpAdvisorRepository("http://localhost"));
  },
);
