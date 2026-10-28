import {
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
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
    await useAdvisorStore.getState().setSession({
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
    jest.spyOn(global, "fetch").mockResolvedValue(
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
  it.each([200, 401])(
    "does not restore or clear a new identity after a late refresh (%s)",
    async (status) => {
      await useAdvisorStore.getState().setSession(session("old", 1000));
      let finish!: (value: Response) => void;
      const fetcher = jest.spyOn(global, "fetch").mockImplementation(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      );
      const pending = new HttpAdvisorRepository("http://localhost").people();
      const rejected = expect(pending).rejects.toMatchObject({
        code: "SESSION_ENDED",
      });
      while (!finish) await new Promise((resolve) => setTimeout(resolve, 0));
      await useAdvisorStore.getState().clear();
      const next = {
        ...session("new"),
        advisor: { id: "another-advisor", name: "Alex Rivera" },
      };
      await useAdvisorStore.getState().setSession(next);
      finish(
        response(
          status,
          status === 200 ? session("stale") : { code: "REFRESH_REPLAY" },
        ),
      );
      await rejected;
      expect((await advisorTokens.get())?.accessToken).toBe("new");
      expect(useAdvisorStore.getState().identity?.advisor.id).toBe(
        "another-advisor",
      );
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it("rejects an old in-flight company response after logout", async () => {
    await advisorTokens.set(session());
    let finish!: (value: Response) => void;
    jest.spyOn(global, "fetch").mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    const pending = new HttpAdvisorRepository("http://localhost").people();
    const rejected = expect(pending).rejects.toMatchObject({
      code: "SESSION_ENDED",
    });
    while (!finish) await new Promise((resolve) => setTimeout(resolve, 0));
    await useAdvisorStore.getState().clear();
    finish(
      response(200, {
        people: [{ id: "old-company-person", name: "Private name" }],
      }),
    );
    await rejected;
    expect(await advisorTokens.get()).toBeNull();
  });
  it("clears advisor access and private drafts before remote logout acknowledges", async () => {
    await useAdvisorStore.getState().setSession(session("old"));
    await saveAdvisorDraft("kickoff", { text: "Fictional private note" });
    let finish!: (value: Response) => void;
    const fetcher = jest.spyOn(global, "fetch").mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    const pending = new HttpAdvisorRepository("http://localhost").logout(
      "logout-key",
    );
    while (!finish) await new Promise((resolve) => setTimeout(resolve, 0));
    expect(useAdvisorStore.getState().identity).toBeNull();
    expect(await advisorTokens.get()).toBeNull();
    expect(await loadAdvisorDraft("kickoff")).toBeNull();
    await useAdvisorStore.getState().setSession(session("new"));
    finish(response(204, null));
    await pending;
    expect((await advisorTokens.get())?.accessToken).toBe("new");
    expect(
      (fetcher.mock.calls[0][1]!.headers as Record<string, string>)
        .Authorization,
    ).toBe("Bearer old");
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
  it("requires reviewed bindings for real meeting edits and routing without fetching a newer version", async () => {
    await advisorTokens.set(session());
    const fetcher = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(response(200, {}));
    const r = new HttpAdvisorRepository("http://localhost", true);
    await expect(
      r.route("meeting", "as_planned", "route"),
    ).rejects.toMatchObject({ code: "VERSION_REQUIRED" });
    await expect(
      r.patch("meeting", { expectedVersion: 3, minutes: 20 }, "patch"),
    ).rejects.toMatchObject({ code: "VERSION_REQUIRED" });
    expect(fetcher).not.toHaveBeenCalled();
    await r.route("meeting", "as_planned", "route", {
      version: 3,
      hash: "a".repeat(64),
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toEqual({
      choice: "as_planned",
      expectedVersion: 3,
      contentHash: "a".repeat(64),
    });
  });
  it("waits for the bounded batch finish instead of aborting at the ordinary 20-second limit", async () => {
    await advisorTokens.set(session());
    jest.useFakeTimers();
    try {
      jest.spyOn(global, "fetch").mockImplementation(
        (_url, options) =>
          new Promise<Response>((resolve, reject) => {
            const provider = setTimeout(
              () => resolve(response(200, {})),
              180000,
            );
            options?.signal?.addEventListener("abort", () => {
              clearTimeout(provider);
              reject(new Error("aborted"));
            });
          }),
      );
      let settled = false;
      const pending = new HttpAdvisorRepository("http://localhost")
        .finish("session", "same-key")
        .then(() => {
          settled = true;
        });
      await jest.advanceTimersByTimeAsync(21000);
      expect(settled).toBe(false);
      await jest.advanceTimersByTimeAsync(180000);
      await pending;
      expect(settled).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });
  it("reports an ordinary transport timeout without claiming the phone is offline", async () => {
    await advisorTokens.set(session());
    jest.useFakeTimers();
    try {
      jest.spyOn(global, "fetch").mockImplementation(
        (_url, options) =>
          new Promise<Response>((_resolve, reject) => {
            options?.signal?.addEventListener("abort", () =>
              reject(new Error("aborted")),
            );
          }),
      );
      const pending = expect(
        new HttpAdvisorRepository("http://localhost").people(),
      ).rejects.toMatchObject({ code: "REQUEST_TIMEOUT" });
      await jest.advanceTimersByTimeAsync(20000);
      await pending;
      expect(await advisorTokens.get()).not.toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
  it("keeps acknowledged kickoff revisions for the next edit and requires a bound closing review", async () => {
    await advisorTokens.set(session());
    const note = {
      id: "note",
      meetingId: "meeting",
      topicId: "business" as const,
      speakerPersonId: "person",
      text: "Fictional note",
      at: new Date().toISOString(),
      version: 2,
      hash: "a".repeat(64),
    };
    const next = { ...note, version: 3, hash: "b".repeat(64) };
    const fetcher = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(response(200, { notes: [next] }));
    const r = new HttpAdvisorRepository("http://localhost", true);
    await expect(r.notes("meeting", [note], "notes")).resolves.toEqual([next]);
    const body = JSON.parse(fetcher.mock.calls[0][1]!.body as string);
    expect(body.notes[0]).toMatchObject({
      expectedVersion: 2,
      contentHash: note.hash,
    });
    expect(body.notes[0]).not.toHaveProperty("version");
    expect(body.notes[0]).not.toHaveProperty("hash");
    await expect(
      r.confirm(
        "meeting",
        {
          proposalId: "proposal",
          ownerPersonKey: "person",
          confirmation: "confirmed",
        },
        "confirm",
      ),
    ).rejects.toMatchObject({ code: "VERSION_REQUIRED" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects missing future API configuration without a network call", async () => {
    const fetcher = jest.spyOn(global, "fetch");
    await expect(
      new HttpAdvisorRepository(undefined).people(),
    ).rejects.toMatchObject({ code: "NOT_AVAILABLE" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

it("locates source playback using actual completed segment durations after interruptions", async () => {
  await advisorTokens.set(session());
  jest.spyOn(global, "fetch").mockResolvedValue(
    response(200, {
      segments: [
        { segmentIndex: 7, complete: true, durationMs: 2000 },
        { segmentIndex: 3, complete: true, durationMs: 1000 },
      ],
    }),
  );
  const source = await new HttpAdvisorRepository(
    "https://api.example.test",
  ).audioSource("meeting-session", 1500);
  expect(source).toMatchObject({
    uri: "https://api.example.test/api/mobile/meetings/v1/sessions/meeting-session/audio/7",
    offsetSeconds: 0.5,
  });
});
it("does not guess a recording offset when duration metadata is missing or the time is out of bounds", async () => {
  await advisorTokens.set(session());
  jest.spyOn(global, "fetch").mockResolvedValue(
    response(200, {
      segments: [{ segmentIndex: 0, complete: true, durationMs: 0 }],
    }),
  );
  const repo = new HttpAdvisorRepository("https://api.example.test");
  expect(await repo.audioSource("meeting-session", 1500)).toBeNull();
  expect(await repo.audioSource("meeting-session", -1)).toBeNull();
});

describe("structured closing ritual", () => {
  async function fixture() {
    const r = new MockAdvisorRepository();
    const m = await r.create(input, "closing-create");
    await r.plan(m.id, "closing-plan");
    const s = await r.start(m.id, "capture", "closing-start");
    await r.consent(
      s.id,
      s.consents.map((person) => ({
        ...person,
        state: "consented",
        at: new Date().toISOString(),
      })),
      "closing-consent",
    );
    await r.transcript(
      s.id,
      [
        {
          id: "closing-source",
          sessionId: s.id,
          revision: 1,
          startMs: 0,
          endMs: 1000,
          text: "Follow up on Tuesday.",
          speakerCluster: "S1",
          source: "live",
          committed: true,
        },
      ],
      "closing-text",
    );
    await r.finish(s.id, "closing-finish");
    await r.decide(
      (await r.session(s.id)).proposals[0],
      "reject",
      "closing-reject",
    );
    return { r, m, s };
  }
  it("guards incomplete and stale review, validates deferral, replays complete once and carries deferred work", async () => {
    const { r, m, s } = await fixture();
    let reviewed = await r.session(s.id);
    await expect(
      r.complete(
        s.id,
        { expectedVersion: reviewed.version, contentHash: reviewed.hash },
        "incomplete",
      ),
    ).rejects.toThrow("Review outcomes");
    await expect(
      r.saveClosing(
        s.id,
        {
          expectedVersion: reviewed.version,
          contentHash: reviewed.hash,
          outcomes: [
            {
              outcomeId: "outcome-1",
              status: "deferred",
              ownerPersonKey: "unknown",
              dueAt: "2026-11-03T19:00:00Z",
            },
          ],
        },
        "invalid-owner",
      ),
    ).rejects.toThrow("attendee owner");
    const outcomes = [
      {
        outcomeId: "outcome-1",
        status: "deferred" as const,
        ownerPersonKey: "dana",
        dueAt: "2026-11-03T19:00:00Z",
      },
    ];
    await r.saveClosing(
      s.id,
      {
        outcomes,
        expectedVersion: reviewed.version,
        contentHash: reviewed.hash,
      },
      "save-closing",
    );
    await expect(
      r.saveClosing(
        s.id,
        {
          outcomes,
          expectedVersion: reviewed.version,
          contentHash: reviewed.hash,
        },
        "stale-outcome-save",
      ),
    ).rejects.toThrow("changed");
    await expect(
      r.complete(
        s.id,
        { expectedVersion: reviewed.version, contentHash: reviewed.hash },
        "stale-closing",
      ),
    ).rejects.toThrow("changed");
    reviewed = await r.session(s.id);
    expect(reviewed.closingReadiness?.complete).toBe(true);
    const command = {
      expectedVersion: reviewed.version,
      contentHash: reviewed.hash,
    };
    const complete = await r.complete(s.id, command, "complete");
    expect(complete.state).toBe("COMPLETE");
    expect(await r.complete(s.id, command, "complete")).toEqual(complete);
    expect((await r.meeting(m.id)).version).toBe(complete.version);
    const next = await r.create(
      { ...input, previousMeetingId: m.id },
      "next-meeting",
    );
    expect(next.power.outcomes).toEqual(["A launch date", "A launch date"]);
    expect(next.agenda[0].forPersonIds).toEqual(["dana"]);
    await expect(
      r.saveClosing(
        s.id,
        {
          outcomes,
          expectedVersion: reviewed.version,
          contentHash: reviewed.hash,
        },
        "after-complete",
      ),
    ).rejects.toThrow("complete");
  });
  it("posts outcome drafts and completion versions through the HTTP adapter", async () => {
    await advisorTokens.set(session());
    const calls: { url: string; body: unknown; key?: string }[] = [];
    jest.spyOn(global, "fetch").mockImplementation(async (url, options) => {
      calls.push({
        url: String(url),
        body: JSON.parse(String(options?.body)),
        key: (options?.headers as Record<string, string>)["Idempotency-Key"],
      });
      return response(200, { state: "COMPLETE" });
    });
    const r = new HttpAdvisorRepository("http://localhost", true);
    const input = {
      expectedVersion: 3,
      contentHash: "current-hash",
      outcomes: [
        {
          outcomeId: "outcome-1",
          status: "met" as const,
          ownerPersonKey: null,
          dueAt: null,
        },
      ],
      followUpPlan: "",
    };
    await r.saveClosing("session-1", input, "save-key");
    await r.complete(
      "session-1",
      { expectedVersion: 3, contentHash: "current-hash" },
      "complete-key",
    );
    expect(calls).toEqual([
      {
        url: "http://localhost/api/mobile/meetings/v1/sessions/session-1/closing",
        body: input,
        key: "save-key",
      },
      {
        url: "http://localhost/api/mobile/meetings/v1/sessions/session-1/complete",
        body: { expectedVersion: 3, contentHash: "current-hash" },
        key: "complete-key",
      },
    ]);
  });
});

describe("resumable finish polling", () => {
  beforeEach(async () => {
    await advisorTokens.set(session());
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });
  const job = (state: string, id = "job-one") => ({
    job: {
      id,
      state,
      stage: "extract",
      completedSegments: 1,
      failureCode: null,
      simulated: true,
    },
  });
  const done = () => ({
    session: { endedAt: "2026-10-28T20:00:00Z" },
    proposals: [],
  });
  it("keeps 202 pending, polls to complete, then requires the same command receipt", async () => {
    const replies = [
      response(202, job("queued")),
      response(200, job("running")),
      response(200, job("complete")),
      response(200, done()),
    ];
    const fetcher = jest
      .spyOn(global, "fetch")
      .mockImplementation(async () => replies.shift()!);
    let settled = false;
    const pending = new HttpAdvisorRepository("http://localhost", true)
      .finish("session-one", "same-key")
      .then(() => {
        settled = true;
      });
    await jest.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1000);
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1000);
    await pending;
    expect(settled).toBe(true);
    expect(
      fetcher.mock.calls.map(([url]) => String(url).split("/").at(-1)),
    ).toEqual(["finish", "finish-job", "finish-job", "finish"]);
    for (const [, init] of fetcher.mock.calls.filter(
      ([, init]) => init?.method === "POST",
    ))
      expect((init!.headers as Record<string, string>)["Idempotency-Key"]).toBe(
        "same-key",
      );
  });
  it("bounds pending checks and resumes with the same key instead of starting another job", async () => {
    const fetcher = jest
      .spyOn(global, "fetch")
      .mockImplementation(async () => response(202, job("queued")));
    const repo = new HttpAdvisorRepository("http://localhost", true);
    const error = repo
      .finish("session-one", "same-key")
      .catch((error) => error);
    await jest.advanceTimersByTimeAsync(61000);
    expect((await error).code).toBe("COMMAND_PENDING");
    expect(
      fetcher.mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(1);
    fetcher.mockResolvedValueOnce(response(200, done()));
    await repo.finish("session-one", "same-key");
    expect(
      (fetcher.mock.calls.at(-1)![1]!.headers as Record<string, string>)[
        "Idempotency-Key"
      ],
    ).toBe("same-key");
  });
  it.each([
    ["needs_review", "FINISH_REVIEW_REQUIRED"],
    ["failed", "COMMAND_FAILED"],
  ])("reports %s without automatic resubmission", async (state, code) => {
    const replies = [response(202, job("queued")), response(200, job(state))];
    const fetcher = jest
      .spyOn(global, "fetch")
      .mockImplementation(async () => replies.shift()!);
    const error = new HttpAdvisorRepository("http://localhost", true)
      .finish("session-one", "same-key")
      .catch((error) => error);
    await jest.advanceTimersByTimeAsync(1000);
    expect((await error).code).toBe(code);
    expect(fetcher.mock.calls).toHaveLength(2);
  });
  it("stops checking on cancellation and retains the pending attempt", async () => {
    const fetcher = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(response(202, job("queued")));
    const controller = new AbortController();
    const error = new HttpAdvisorRepository("http://localhost", true)
      .finish("session-one", "same-key", { signal: controller.signal })
      .catch((error) => error);
    await jest.advanceTimersByTimeAsync(0);
    controller.abort();
    expect((await error).code).toBe("COMMAND_PENDING");
    await jest.advanceTimersByTimeAsync(5000);
    expect(fetcher.mock.calls).toHaveLength(1);
  });
  it("does not read another company after logout while polling", async () => {
    const fetcher = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(response(202, job("queued")));
    const error = new HttpAdvisorRepository("http://localhost", true)
      .finish("session-one", "same-key")
      .catch((error) => error);
    await jest.advanceTimersByTimeAsync(0);
    await clearAdvisorData();
    await jest.advanceTimersByTimeAsync(1000);
    expect((await error).code).toBe("SESSION_ENDED");
    expect(fetcher.mock.calls).toHaveLength(1);
  });
  it("times out a status request without falsely finishing or resubmitting", async () => {
    let calls = 0;
    const fetcher = jest
      .spyOn(global, "fetch")
      .mockImplementation(async (_url, init) => {
        if (++calls === 1) return response(202, job("queued"));
        return new Promise<Response>((_resolve, reject) =>
          init!.signal!.addEventListener("abort", () =>
            reject(new Error("aborted")),
          ),
        );
      });
    const error = new HttpAdvisorRepository("http://localhost", true)
      .finish("session-one", "same-key")
      .catch((error) => error);
    await jest.advanceTimersByTimeAsync(22000);
    expect((await error).code).toBe("REQUEST_TIMEOUT");
    expect(fetcher.mock.calls).toHaveLength(2);
  });
  it("cannot use another job's complete status as this command's completion", async () => {
    let get = false;
    const fetcher = jest
      .spyOn(global, "fetch")
      .mockImplementation(async (_url, init) => {
        if (init?.method === "GET") {
          get = true;
          return response(200, job("complete", "another-job"));
        }
        return response(202, job("queued"));
      });
    const controller = new AbortController();
    let settled = false;
    const error = new HttpAdvisorRepository("http://localhost", true)
      .finish("session-one", "same-key", { signal: controller.signal })
      .then(() => {
        settled = true;
      })
      .catch((error) => error);
    await jest.advanceTimersByTimeAsync(1000);
    expect(get).toBe(true);
    expect(settled).toBe(false);
    expect(fetcher.mock.calls).toHaveLength(3);
    controller.abort();
    expect((await error).code).toBe("COMMAND_PENDING");
  });
  it("cancels an in-flight status request without accepting its eventual response", async () => {
    let calls = 0;
    const fetcher = jest
      .spyOn(global, "fetch")
      .mockImplementation(async (_url, init) => {
        if (++calls === 1) return response(202, job("queued"));
        return new Promise<Response>((_resolve, reject) =>
          init!.signal!.addEventListener("abort", () =>
            reject(new Error("aborted")),
          ),
        );
      });
    const controller = new AbortController();
    const error = new HttpAdvisorRepository("http://localhost", true)
      .finish("session-one", "same-key", { signal: controller.signal })
      .catch((error) => error);
    await jest.advanceTimersByTimeAsync(1000);
    expect(fetcher).toHaveBeenCalledTimes(2);
    controller.abort();
    expect((await error).code).toBe("COMMAND_PENDING");
  });
  it.each([200, 202])(
    "refuses an unacknowledged empty finish response (%s)",
    async (status) => {
      jest.spyOn(global, "fetch").mockResolvedValue(response(status, {}));
      await expect(
        new HttpAdvisorRepository("http://localhost", true).finish(
          "session-one",
          "same-key",
        ),
      ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    },
  );
  it.each(["cancel", "timeout"])(
    "keeps %s active while a status response body is still loading",
    async (mode) => {
      let calls = 0;
      jest.spyOn(global, "fetch").mockImplementation(async (_url, init) => {
        if (++calls === 1) return response(202, job("queued"));
        return {
          status: 200,
          ok: true,
          text: () =>
            new Promise<string>((_resolve, reject) =>
              init!.signal!.addEventListener("abort", () =>
                reject(new Error("body aborted")),
              ),
            ),
        } as Response;
      });
      const controller = new AbortController();
      const error = new HttpAdvisorRepository("http://localhost", true)
        .finish("session-one", "same-key", { signal: controller.signal })
        .catch((error) => error);
      await jest.advanceTimersByTimeAsync(1000);
      if (mode === "cancel") controller.abort();
      else await jest.advanceTimersByTimeAsync(21000);
      expect((await error).code).toBe(
        mode === "cancel" ? "COMMAND_PENDING" : "REQUEST_TIMEOUT",
      );
      expect(calls).toBe(2);
    },
  );
  it("keeps an ambiguous dispatch review code from the command replay", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(
      response(409, {
        code: "FINISH_REVIEW_REQUIRED",
        message: "Review required",
        retryable: false,
      }),
    );
    await expect(
      new HttpAdvisorRepository("http://localhost", true).finish(
        "session-one",
        "same-key",
      ),
    ).rejects.toMatchObject({
      code: "FINISH_REVIEW_REQUIRED",
      retryable: false,
    });
  });
});

describe("optional meeting gate suggestion", () => {
  it("keeps the mock off and never changes the rules or meeting route", async () => {
    const repo = new MockAdvisorRepository();
    const meeting = await repo.create(input, "suggestion-create");
    const planned = await repo.plan(meeting.id, "suggestion-plan");
    const before = await repo.meeting(meeting.id);
    const result = await repo.gateSuggestion(meeting.id, "suggestion-key");
    expect(result.status).toBe("off");
    expect(result.suggestion).toBeNull();
    expect(result.deterministic).toEqual(planned.gate);
    expect(await repo.meeting(meeting.id)).toEqual(before);
  });
  it("sends an explicit authenticated idempotent request without applying its suggestion", async () => {
    await advisorTokens.set(session());
    const result = {
      deterministic: { mode: "LIVE", reason: "Rules still apply" },
      suggestion: { suggestion: "shorten", reason: "One issue remains" },
      status: "suggestion",
      simulated: true,
    };
    const fetcher = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(response(200, result));
    const repo = new HttpAdvisorRepository("http://localhost", true);
    expect(await repo.gateSuggestion("meeting-one", "gate-key")).toEqual(
      result,
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(
      "http://localhost/api/mobile/meetings/v1/meetings/meeting-one/gate-suggestion",
    );
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({});
    expect((init?.headers as Record<string, string>)["Idempotency-Key"]).toBe(
      "gate-key",
    );
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer one",
    );
  });
});
