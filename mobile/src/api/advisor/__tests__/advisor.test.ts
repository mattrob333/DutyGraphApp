import { beforeEach, describe, expect, it, jest } from "@jest/globals";
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
import { MockAdvisorRepository } from "../MockAdvisorRepository";
import { HttpAdvisorRepository } from "../HttpAdvisorRepository";
import type { AdvisorSession, CreateMeeting } from "../types";
import {
  advisorTokens,
  clearAdvisorData,
  loadAdvisorDraft,
  saveAdvisorDraft,
  advisorCommandKey,
  acknowledgeAdvisorCommand,
} from "@/storage/advisor";
import { useAdvisorStore } from "@/state/advisor";
import * as Crypto from "expo-crypto";

const input: CreateMeeting = {
  title: "Carrier launch",
  startsAt: null,
  minutes: 25,
  purpose: "Decide when to launch.",
  outcomes: ["A launch date"],
  execution: "Confirm an owner",
  attendees: [
    { personId: "dana", name: "Dana Whitlock", roles: ["decision_maker"] },
  ],
};
const session = (token = "one", expiresIn = 900000): AdvisorSession => ({
  accessToken: token,
  refreshToken: `refresh-${token}`,
  accessExpiresAt: new Date(Date.now() + expiresIn).toISOString(),
  expiresAt: new Date(Date.now() + 2592000000).toISOString(),
  advisor: { id: "advisor", name: "Alex Moreno" },
  company: { id: "larkspur", name: "Larkspur Supply" },
  role: "advisor_mobile",
});
const response = (status: number, body: unknown) =>
  ({
    status,
    ok: status >= 200 && status < 300,
    text: async () => JSON.stringify(body),
  }) as Response;
beforeEach(async () => {
  await clearAdvisorData();
  jest.restoreAllMocks();
  let id = 0;
  jest
    .spyOn(Crypto, "randomUUID")
    .mockImplementation(
      () => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`,
    );
});

describe("advisor mock safety and lifecycle", () => {
  it("keeps creation idempotent and rejects key reuse with another body", async () => {
    const r = new MockAdvisorRepository();
    const first = await r.create(input, "create");
    expect(await r.create(input, "create")).toEqual(first);
    await expect(
      r.create({ ...input, title: "Another meeting" }, "create"),
    ).rejects.toThrow("retry key");
    expect((await r.meetings()).filter((m) => m.id === first.id)).toHaveLength(
      1,
    );
  });
  it("uses the shared gate to block decisions without an authorized person and sensitive meetings", async () => {
    const r = new MockAdvisorRepository();
    const m = await r.create(
      { ...input, attendees: [{ ...input.attendees[0], roles: ["resource"] }] },
      "create",
    );
    expect((await r.plan(m.id, "plan")).gate?.mode).toBe("INSUFFICIENT_INFO");
    await expect(r.start(m.id, "copilot", "start")).rejects.toThrow(
      "person who decides",
    );
    const sensitive = await r.create(
      { ...input, purpose: "Discuss harassment complaints" },
      "sensitive",
    );
    expect((await r.plan(sensitive.id, "sensitive-plan")).gate?.route).toBe(
      "HUMAN_ESCALATION",
    );
  });
  it("requires every consent, keeps source revisions, and blocks acceptance until speaker confirmation", async () => {
    const r = new MockAdvisorRepository(),
      m = await r.create(input, "create");
    await r.plan(m.id, "plan");
    const s = await r.start(m.id, "capture", "start");
    await expect(r.transcript(s.id, [], "no-consent")).rejects.toThrow(
      "Consent",
    );
    const consent = s.consents.map((a) => ({
      ...a,
      state: "consented" as const,
      at: new Date().toISOString(),
    }));
    await r.consent(s.id, consent, "consent");
    const segment = {
      id: "segment-one",
      revision: 1,
      sessionId: s.id,
      startMs: 0,
      endMs: 1000,
      text: "The launch is Tuesday.",
      speakerCluster: "S1",
      source: "live" as const,
      committed: true,
    };
    await r.transcript(s.id, [segment], "words");
    await r.finish(s.id, "finish");
    let proposal = (await r.session(s.id)).proposals[0];
    expect(proposal.sources[0].segmentId).toBe(segment.id);
    await expect(r.decide(proposal, "accept", "unknown")).rejects.toThrow(
      "speaker",
    );
    await r.speakers(
      s.id,
      {
        sessionId: s.id,
        entries: [
          {
            cluster: "S1",
            personKey: "dana",
            suggested: false,
            confirmedBy: "leader",
          },
        ],
      },
      "speakers",
    );
    proposal = (await r.session(s.id)).proposals[0];
    expect((await r.decide(proposal, "accept", "accept")).state).toBe(
      "accepted",
    );
    await r.transcript(
      s.id,
      [{ ...segment, revision: 2, text: "The launch is Wednesday." }],
      "edit-source",
    );
    proposal = (await r.session(s.id)).proposals[0];
    expect(proposal.state).toBe("stale");
    await expect(r.decide(proposal, "accept", "stale-accept")).rejects.toThrow(
      "source",
    );
  });
  it("does not invent recording or audio uploads in demo mode", async () => {
    await expect(new MockAdvisorRepository().uploadSegment()).rejects.toThrow(
      "does not record",
    );
  });
});

describe("advisor transport and secure drafts", () => {
  it("keeps independent failed commands durable while another succeeds", async () => {
    const [first, duplicate] = await Promise.all([
      advisorCommandKey("failed-A"),
      advisorCommandKey("failed-A"),
    ]);
    expect(first).toBe(duplicate);
    const second = await advisorCommandKey("successful-B");
    await acknowledgeAdvisorCommand("successful-B", second);
    expect(await advisorCommandKey("failed-A")).toBe(first);
    expect(await advisorCommandKey("successful-B")).not.toBe(second);
    await clearAdvisorData();
    expect(await advisorCommandKey("failed-A")).not.toBe(first);
  });
  it("prevents queued autosaves from resurrecting drafts during local signout", async () => {
    await saveAdvisorDraft("before", "private");
    const clearing = clearAdvisorData();
    const late = saveAdvisorDraft("after", "private");
    await Promise.all([clearing, late]);
    expect(await loadAdvisorDraft("before")).toBeNull();
    expect(await loadAdvisorDraft("after")).toBeNull();
  });
  it("clears another advisor’s local drafts even when the company is unchanged", async () => {
    await useAdvisorStore.getState().setSession(session());
    await saveAdvisorDraft("private", "first advisor");
    await useAdvisorStore
      .getState()
      .setSession({
        ...session("second"),
        advisor: { id: "another-advisor", name: "Morgan" },
      });
    expect(await loadAdvisorDraft("private")).toBeNull();
    expect(useAdvisorStore.getState().identity?.advisor.id).toBe(
      "another-advisor",
    );
  });
  it("serializes concurrent draft registration and clears all role data", async () => {
    await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        saveAdvisorDraft(`draft-${i}`, { text: `note-${i}` }),
      ),
    );
    expect(await loadAdvisorDraft("draft-9")).toEqual({ text: "note-9" });
    await clearAdvisorData();
    for (let i = 0; i < 12; i++)
      expect(await loadAdvisorDraft(`draft-${i}`)).toBeNull();
  });
  it("preserves words and the refresh retry key after a temporary failure and repository restart", async () => {
    await advisorTokens.set(session("one", 1000));
    await saveAdvisorDraft("kickoff", { text: "Private note" });
    const keys: string[] = [];
    let attempts = 0;
    const fetcher = jest
      .spyOn(global, "fetch")
      .mockImplementation(async (url, options) => {
        if (String(url).endsWith("/advisor/session/refresh")) {
          keys.push(
            (options!.headers as Record<string, string>)["Idempotency-Key"],
          );
          attempts++;
          return attempts === 1
            ? response(503, {
                code: "TEMPORARY",
                message: "Try again",
                retryable: true,
              })
            : response(200, session("two"));
        }
        return response(200, { people: [] });
      });
    await expect(
      new HttpAdvisorRepository("http://localhost").people(),
    ).rejects.toMatchObject({ status: 503 });
    expect(await advisorTokens.get()).not.toBeNull();
    expect(await loadAdvisorDraft("kickoff")).toEqual({ text: "Private note" });
    await expect(
      new HttpAdvisorRepository("http://localhost").people(),
    ).resolves.toEqual([]);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("refreshes concurrent requests once and clears the UI identity on refresh replay", async () => {
    await useAdvisorStore.getState().setSession(session("one", 1000));
    let refreshes = 0;
    jest.spyOn(global, "fetch").mockImplementation(async (url) => {
      if (String(url).endsWith("/advisor/session/refresh")) {
        refreshes++;
        return response(200, session("two"));
      }
      return response(200, { people: [] });
    });
    const r = new HttpAdvisorRepository("http://localhost");
    await Promise.all([r.people(), r.people(), r.people()]);
    expect(refreshes).toBe(1);
    await useAdvisorStore.getState().setSession(session("two", 1000));
    jest
      .spyOn(global, "fetch")
      .mockResolvedValue(
        response(401, {
          code: "REFRESH_REPLAY",
          message: "Pair again",
          retryable: false,
        }),
      );
    await expect(
      new HttpAdvisorRepository("http://localhost").people(),
    ).rejects.toMatchObject({ status: 401 });
    expect(useAdvisorStore.getState().identity).toBeNull();
    expect(await advisorTokens.get()).toBeNull();
  });
  it("uses the exact transcript command shape and keeps the caller key", async () => {
    await advisorTokens.set(session());
    const fetcher = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(response(200, {}));
    await new HttpAdvisorRepository("http://localhost").transcript(
      "session",
      [
        {
          sessionId: "session",
          id: "seg",
          revision: 1,
          startMs: 0,
          endMs: 1,
          text: "Words",
          speakerCluster: "S1",
          source: "live",
          committed: true,
        },
      ],
      "same-key",
    );
    const options = fetcher.mock.calls[0][1]!;
    expect((options.headers as Record<string, string>)["Idempotency-Key"]).toBe(
      "same-key",
    );
    expect(JSON.parse(String(options.body)).segments[0]).not.toHaveProperty(
      "sessionId",
    );
  });
  it("rejects missing future API configuration without a network call", async () => {
    const fetcher = jest.spyOn(global, "fetch");
    await expect(
      new HttpAdvisorRepository(undefined).people(),
    ).rejects.toMatchObject({ code: "NOT_AVAILABLE" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
