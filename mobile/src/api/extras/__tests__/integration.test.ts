import { afterEach, beforeEach, expect, it, jest } from "@jest/globals";
import { HttpCompanionRepository } from "@/api/http/HttpCompanionRepository";
import type { ApiClient } from "@/api/http/client";
import { config } from "@/api/config";
import { profileDto } from "@/api/http/testUtils";
import { pendingAnswers } from "@/api/http/pendingAnswers";
import { CompanionApiError } from "@/types/domain";
const mockStore = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  AFTER_FIRST_UNLOCK: 0,
  getItemAsync: async (k: string) => mockStore.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => {
    mockStore.set(k, v);
  },
  deleteItemAsync: async (k: string) => {
    mockStore.delete(k);
  },
}));
const original = { ...config };
const pulse = {
  id: "pulse-1",
  title: "Carrier update",
  dueAt: "2026-10-27T16:00:00Z",
  estimateMinutes: 2,
  questions: [{ text: "Is the carrier API still blocked?" }],
  version: 1,
  contentHash: "a".repeat(64),
  state: "sent",
};
beforeEach(() => {
  mockStore.clear();
  config.meetingsApiBaseUrl = "https://dev.test";
  config.companionScope = "full";
});
afterEach(() => {
  Object.assign(config, original);
});
it("delivers participant Pulse, wrap-up and meeting outcomes into Today", async () => {
  const get = jest.fn(async (path: string) =>
    path === "/me"
      ? profileDto
      : path === "/requests"
        ? { requests: [] }
        : path === "/pulses"
          ? { pulses: [pulse] }
          : path === "/confirmations"
            ? {
                confirmations: [
                  {
                    id: "meeting-1",
                    meetingId: "meeting-1",
                    title: "Operations review",
                    itemCount: 1,
                    complete: false,
                  },
                ],
              }
            : path === "/meetings"
              ? {
                  meetings: [
                    {
                      id: "meeting-1",
                      title: "Status meeting",
                      outcome: "AVOIDED",
                      statusLine: "You no longer need to join.",
                      route: "/meetings/meeting-1/avoided",
                    },
                  ],
                }
              : {},
  );
  const repo = new HttpCompanionRepository({ get } as unknown as ApiClient);
  const today = await repo.getToday();
  expect(today.dueNow.map((x) => x.route)).toEqual([
    "/pulse/pulse-1",
    "/confirmations/wrapup:meeting-1",
  ]);
  expect(today.banner?.body).toBe("You no longer need to join.");
  expect(get.mock.calls.some((c) => c[0] === "/pulses")).toBe(true);
});
it("uses the same durable answer queue and key for a Pulse retry", async () => {
  const get = jest.fn(async () => pulse);
  const post = jest
    .fn<(...args: any[]) => Promise<unknown>>()
    .mockRejectedValueOnce(
      new CompanionApiError("NETWORK_OFFLINE", "Offline", 0, true),
    )
    .mockResolvedValue({
      responseId: "response-1",
      requestId: "pulse-1",
      idempotentReplay: false,
    });
  const repo = new HttpCompanionRepository({
    get,
    post,
  } as unknown as ApiClient);
  const questions = await repo.getQuestionSet("pulse:pulse-1");
  expect(questions.questions.at(-1)?.isElse).toBe(true);
  const input = {
    requestId: questions.requestId,
    idempotencyKey: "pulse-first-key",
    expectedVersion: questions.version,
    contentHash: questions.contentHash,
    submission: {
      text: "The carrier API is still blocked.",
      questionAnswers: { "question.0": "The carrier API is still blocked." },
    },
  };
  await expect(repo.submitAnswers(input)).rejects.toThrow("Offline");
  expect((await pendingAnswers.get(input.requestId))?.idempotencyKey).toBe(
    "pulse-first-key",
  );
  await repo.submitAnswers({ ...input, idempotencyKey: "different-retry-key" });
  expect(post.mock.calls.map((c) => c[2].idempotencyKey)).toEqual([
    "pulse-first-key",
    "pulse-first-key",
  ]);
  expect(post.mock.calls[1][0]).toBe("/pulses/pulse-1/responses");
  expect(post.mock.calls[1][1]).toMatchObject({
    expectedVersion: 1,
    contentHash: pulse.contentHash,
    participantConfirmed: true,
  });
  expect(await pendingAnswers.get(input.requestId)).toBeNull();
});
