jest.mock("expo-secure-store", () => ({
  AFTER_FIRST_UNLOCK: 1,
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
  deleteItemAsync: async () => undefined,
}));
import { describe, it, expect, jest } from "@jest/globals";
import { HttpEarnRepository, localEarnOrigin } from "../HttpEarnRepository";
import { UnavailableEarnRepository, getEarnRepository } from "../index";
import { ApiClient } from "../../http/client";
import { HttpCompanionRepository } from "../../http/HttpCompanionRepository";
import { errorFromResponse } from "../../http/errors";
import type { StoredSession } from "@/storage/tokens";
import type { TaskCardDraftInput } from "../types";
const card: TaskCardDraftInput = {
  title: "Check the returns tray",
  duty: "Check returns",
  kind: "today",
  workType: "manual",
  slots: {
    startsWhen: { value: null, basis: "not_stated" },
    getsFrom: { value: null, basis: "not_stated" },
    does: { value: "Check the tray.", basis: "told_me" },
    handsTo: { value: null, basis: "not_stated" },
    howOften: { value: null, basis: "not_stated" },
    howLong: { value: null, basis: "not_stated" },
    onlyIKnow: { value: null, basis: "not_stated" },
  },
  steps: [],
};
function fake(capability: "fake" | "real" = "fake") {
  const calls: {
    method: string;
    path: string;
    body?: unknown;
    options?: unknown;
  }[] = [];
  const client = {
    get: async <T>(path: string) => {
      calls.push({ method: "GET", path });
      if (path === "/earn/capabilities") {
        if (capability === "real")
          throw Object.assign(new Error("Not found"), { status: 404 });
        return { developmentFixture: true, draftCreation: true } as T;
      }
      return { ok: true } as T;
    },
    post: async <T>(path: string, body?: unknown, options?: unknown) => {
      calls.push({ method: "POST", path, body, options });
      return { ok: true } as T;
    },
  };
  return { client, calls };
}
const response = (status: number, body: unknown) =>
  ({
    status,
    ok: status >= 200 && status < 300,
    text: async () => JSON.stringify(body),
    headers: { get: () => null },
  }) as unknown as Response;
describe("Earn repository boundary", () => {
  it("does not send reviewed words under a replacement enrollment after capabilities resolves", async () => {
    let stored: StoredSession | null = {
      accessToken: "old-access", refreshToken: "old-refresh",
      accessExpiresAt: "2099-01-01T00:00:00Z", deviceId: "old-device",
    };
    const sent: { method: string; bearer: string; body: unknown }[] = [];
    const client = new ApiClient({
      baseUrl: "http://localhost",
      tokenStore: { get: async () => stored, set: async value => { stored = value; }, clear: async () => { stored = null; } },
      fetch: async (_url, init) => {
        sent.push({ method: init.method, bearer: init.headers.Authorization, body: init.body });
        return response(200, {});
      },
    });
    const repo = new HttpEarnRepository({
      get: async <T>(path: string) => {
        const value = await client.get<T>(path);
        // The GET has passed its own generation fence. Replace enrollment
        // before the repository continuation dispatches its separate POST.
        await client.clearSession();
        stored = { accessToken: "new-access", refreshToken: "new-refresh", accessExpiresAt: "2099-01-01T00:00:00Z", deviceId: "new-device" };
        return value;
      },
      post: client.post.bind(client),
    }, "http://localhost", true);
    await expect(repo.createFix({ text: "Old person's reviewed words", kind: "new_steps", measureName: "Returns", hoursBefore: 20, hoursAfter: 5 }, "old-intent-key")).rejects.toMatchObject({ code: "SESSION_ENDED" });
    expect(sent.map(item => item.method)).toEqual(["GET"]);
  });
  it("uses scoped URLs, version pins and the caller retry key without identity body fields", async () => {
    const { client, calls } = fake(),
      repo = new HttpEarnRepository(client, "http://127.0.0.1:4510", true);
    await repo.confirmDraft("draft/other?x", 4, "same-key");
    await repo.notMine("draft1", 2, "not-mine");
    await repo.createFix(
      {
        text: "Check the tray.",
        kind: "new_steps",
        measureName: "Returns checked",
        hoursBefore: 20,
        hoursAfter: 5,
      },
      "fix",
    );
    const writes = calls.filter((c) => c.method === "POST");
    expect(writes[0]).toEqual({
      method: "POST",
      path: "/earn/drafts/draft%2Fother%3Fx/confirm",
      body: { expectedVersion: 4 },
      options: { idempotencyKey: "same-key" },
    });
    expect(writes[1].body).toEqual({ expectedVersion: 2 });
    expect(JSON.stringify(calls)).not.toContain("personId");
    expect(JSON.stringify(calls)).not.toContain("companyId");
  });
  it("forwards reviewed slot edits atomically with the confirm version", async () => {
    const { client, calls } = fake(),
      repo = new HttpEarnRepository(client, "http://localhost", true);
    await repo.confirmDraft("abc", 2, "edit-confirm", card);
    const write = calls.find((c) => c.method === "POST")!;
    expect(write.body).toEqual({ expectedVersion: 2, card });
    expect(write.options).toEqual({ idempotencyKey: "edit-confirm" });
  });
  it("calls every read under the Earn participant prefix", async () => {
    const { client, calls } = fake(),
      repo = new HttpEarnRepository(client, "http://localhost", true);
    await repo.getSummary();
    await repo.listDrafts("confirmed");
    await repo.getDraft("abc");
    await repo.getTeamBoard();
    await repo.getGaps();
    expect(
      calls.filter((c) => c.path !== "/earn/capabilities").map((c) => c.path),
    ).toEqual([
      "/earn/summary",
      "/earn/drafts?state=confirmed",
      "/earn/drafts/abc",
      "/earn/team-board",
      "/earn/gaps",
    ]);
  });
  it("does not fetch fixture reads or send writes in a production build", async () => {
    const { client, calls } = fake(),
      repo = new HttpEarnRepository(client, "http://localhost", false);
    await expect(repo.getSummary()).rejects.toMatchObject({
      code: "NOT_AVAILABLE",
    });
    await expect(repo.confirmDraft("abc", 1, "key")).rejects.toMatchObject({
      code: "NOT_AVAILABLE",
    });
    expect(await repo.supportsDraftCreation()).toBe(false);
    expect(calls.every((c) => c.path === "/earn/capabilities")).toBe(true);
  });
  it("keeps real A contract data available when the unsupported capability route is404", async () => {
    const { client, calls } = fake("real"),
      repo = new HttpEarnRepository(client, "https://example.com", false);
    await expect(repo.getSummary()).resolves.toEqual({ ok: true });
    await repo.confirmDraft("abc", 1, "confirm");
    expect(calls.some((c) => c.path === "/earn/summary")).toBe(true);
    expect(calls.some((c) => c.method === "POST")).toBe(true);
    expect(await repo.supportsDraftCreation()).toBe(false);
  });
  it("does not bypass unknown capability or authentication failures", async () => {
    const post = jest.fn();
    const repo = new HttpEarnRepository(
      {
        get: async () => {
          throw Object.assign(new Error("Offline"), { status: 503 });
        },
        post: post as any,
      },
      "http://localhost",
      false,
    );
    await expect(repo.getSummary()).rejects.toMatchObject({ status: 503 });
    expect(post).not.toHaveBeenCalled();
  });
  it("never invents live draft creation even when a remote claims a capability", async () => {
    const { client, calls } = fake(),
      repo = new HttpEarnRepository(client, "https://example.com", true);
    expect(await repo.supportsDraftCreation()).toBe(false);
    await expect(repo.createDraftFromTask(card, "new")).rejects.toMatchObject({
      code: "NOT_AVAILABLE",
    });
    expect(calls).toEqual([]);
  });
  it("requires authenticated local capability before using the dev-only draft route", async () => {
    const { client, calls } = fake(),
      repo = new HttpEarnRepository(client, "http://localhost:4510", true);
    await repo.createDraftFromTask(card, "new");
    expect(calls[0].path).toBe("/earn/capabilities");
    expect(calls.find((c) => c.method === "POST")).toEqual({
      method: "POST",
      path: "/earn/drafts",
      body: { cards: [card], sourceNote: "app" },
      options: { idempotencyKey: "new" },
    });
    const unavailable = new HttpEarnRepository(
      {
        get: async () => {
          throw Object.assign(new Error("missing route"), { status: 404 });
        },
        post: client.post,
      },
      "http://localhost",
      true,
    );
    expect(await unavailable.supportsDraftCreation()).toBe(false);
  });
  it("mock mode is calm and never makes a network call", async () => {
    const previous = global.fetch,
      fetchMock = jest.fn();
    global.fetch = fetchMock as typeof fetch;
    try {
      const repo = new UnavailableEarnRepository();
      expect(await repo.supportsDraftCreation()).toBe(false);
      await expect(repo.getSummary()).rejects.toMatchObject({
        code: "NOT_AVAILABLE",
      });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      global.fetch = previous;
    }
  });
  it("uses the existing generation fence to reject an old response after logout", async () => {
    let release: (value: Response) => void = () => undefined;
    const tokenStore = {
      get: async () => ({
        accessToken: "fictional-access",
        refreshToken: "fictional-refresh",
        accessExpiresAt: "2099-01-01T00:00:00Z",
        deviceId: "fictional-device",
      }),
      set: async () => undefined,
      clear: async () => undefined,
    };
    const client = new ApiClient({
      baseUrl: "http://localhost",
      tokenStore,
      fetch: async () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    });
    const repo = new HttpEarnRepository(client, "http://localhost", true);
    const pending = repo.getSummary();
    await Promise.resolve();
    await Promise.resolve();
    await client.clearSession();
    release(response(200, { private: "old company response" }));
    await expect(pending).rejects.toMatchObject({ code: "SESSION_ENDED" });
  });
  it("shares one refresh between injected participant Me and Earn repositories", async () => {
    let stored: StoredSession | null = {
      accessToken: "old-access",
      refreshToken: "old-refresh",
      accessExpiresAt: "2099-01-01T00:00:00Z",
      deviceId: "fixture-device",
    };
    let refreshes = 0;
    const tokens = {
      get: async () => stored,
      set: async (value: StoredSession) => {
        stored = value;
      },
      clear: async () => {
        stored = null;
      },
    };
    const client = new ApiClient({
      baseUrl: "http://localhost/api/mobile/v1",
      tokenStore: tokens,
      fetch: async (input, init) => {
        const path = new URL(input).pathname.replace("/api/mobile/v1", "");
        if (path === "/session/refresh") {
          refreshes++;
          await Promise.resolve();
          return response(200, {
            accessToken: "new-access",
            refreshToken: "new-refresh",
            accessTokenExpiresAt: "2099-01-01T00:00:00Z",
            refreshTokenExpiresAt: "2099-02-01T00:00:00Z",
            deviceId: "fixture-device",
          });
        }
        if (init.headers.Authorization === "Bearer old-access")
          return response(401, {
            code: "SESSION_EXPIRED",
            message: "Refresh.",
          });
        if (path === "/earn/capabilities")
          return response(404, {
            code: "NOT_AVAILABLE",
            message: "Not available.",
          });
        if (path === "/me")
          return response(200, {
            personId: "fixture-person",
            companyId: "fixture-company",
            name: "Riley Sample",
            companyName: "Fictional Distribution",
            roleTitle: "Stores lead",
          });
        return response(200, { ok: true });
      },
    });
    const companion = new HttpCompanionRepository(client),
      earn = getEarnRepository(companion);
    expect(getEarnRepository(companion)).toBe(earn);
    expect(companion.getExtensionApiClient()).toBe(client);
    const [me, summary] = await Promise.all([
      companion.getMe(),
      earn.getSummary(),
    ]);
    expect(me.displayName).toBe("Riley Sample");
    expect(summary).toEqual({ ok: true });
    expect(refreshes).toBe(1);
  });
  it("uses the injected transport origin for the local-only creation guard", async () => {
    let calls = 0;
    const client = new ApiClient({
      baseUrl: "https://remote.example.com/api/mobile/v1",
      fetch: async () => {
        calls++;
        return response(200, { developmentFixture: true, draftCreation: true });
      },
    });
    const companion = new HttpCompanionRepository(client),
      earn = getEarnRepository(companion);
    expect(await earn.supportsDraftCreation()).toBe(false);
    expect(calls).toBe(0);
  });
  it("normalizes nested and existing flat error envelopes without exposing raw bodies", () => {
    for (const value of [
      {
        error: {
          code: "VERSION_CONFLICT",
          message: "Reload this draft.",
          retryable: false,
        },
      },
      {
        code: "VERSION_CONFLICT",
        message: "Reload this draft.",
        retryable: false,
      },
    ])
      expect(errorFromResponse(409, JSON.stringify(value))).toMatchObject({
        code: "VERSION_CONFLICT",
        message: "Reload this draft.",
        status: 409,
        retryable: false,
      });
  });
  it("accepts only loopback HTTP origins without embedded credentials", () => {
    expect(localEarnOrigin("http://localhost:4510")).toBe(true);
    expect(localEarnOrigin("http://127.0.0.1:4510")).toBe(true);
    for (const value of [
      "https://example.com",
      "http://localhost.example.com",
      "http://user:pass@localhost",
      "file:///tmp",
    ])
      expect(localEarnOrigin(value)).toBe(false);
  });
});
