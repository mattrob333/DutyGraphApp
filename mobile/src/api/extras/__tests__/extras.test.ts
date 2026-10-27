import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { HttpParticipantExtrasRepository, pulseQuestionSet } from "../http";
import { clearPendingTaskDecisions, pendingTaskDecisions } from "../pending";
import type { ApiClient } from "@/api/http/client";
import { CompanionApiError } from "@/types/domain";
import type { TaskDecisionInput } from "../types";
const mockStorage = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  AFTER_FIRST_UNLOCK: 0,
  getItemAsync: async (k: string) => mockStorage.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => {
    mockStorage.set(k, v);
  },
  deleteItemAsync: async (k: string) => {
    mockStorage.delete(k);
  },
}));
const input: TaskDecisionInput = {
  taskCardId: "card-1",
  decision: "correct",
  recordVersion: 3,
  contentHash: "a".repeat(64),
  idempotencyKey: "first-key",
};
const pulse = {
  id: "pulse-1",
  title: "Work update",
  dueAt: "2026-10-27T12:00:00Z",
  estimateMinutes: 2,
  version: 1,
  contentHash: "b".repeat(64),
  state: "sent",
  questions: [{ text: "Is the carrier API still blocked?" }],
};
beforeEach(async () => {
  await clearPendingTaskDecisions();
  mockStorage.clear();
});
it("attests the exact real contract and removes only after acknowledgement", async () => {
  let acknowledge!: () => void;
  const post = jest.fn(
    () =>
      new Promise<void>((resolve) => {
        acknowledge = resolve;
      }),
  );
  const repo = new HttpParticipantExtrasRepository(
    { post } as unknown as ApiClient,
    "https://dev.test",
  );
  const sending = repo.decideTaskCard(input);
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(await pendingTaskDecisions()).toEqual([input]);
  expect(post).toHaveBeenCalledWith(
    "/task-cards/card-1/attest",
    {
      recordVersion: 3,
      contentHash: input.contentHash,
      decision: "correct",
      correction: null,
    },
    { idempotencyKey: "first-key" },
  );
  acknowledge();
  expect(await sending).toMatchObject({ acknowledged: true });
  expect(await pendingTaskDecisions()).toEqual([]);
});
it("keeps non-attest choices pending on the real server with no extension", async () => {
  const post = jest.fn();
  const repo = new HttpParticipantExtrasRepository(
    { post } as unknown as ApiClient,
    "",
  );
  const result = await repo.decideTaskCard({
    ...input,
    decision: "not_mine",
    note: "Priya does this.",
  });
  expect(result).toMatchObject({
    acknowledged: false,
    pending: true,
    message: "Your advisor will see this when your app is updated.",
  });
  expect(post).not.toHaveBeenCalled();
  expect(await pendingTaskDecisions()).toHaveLength(1);
});
it("retries a failed command with its first persisted key", async () => {
  const post = jest
    .fn<(...args: any[]) => Promise<unknown>>()
    .mockRejectedValueOnce(
      new CompanionApiError("NETWORK_OFFLINE", "Offline", 0, true),
    )
    .mockResolvedValue({ ok: true });
  const repo = new HttpParticipantExtrasRepository(
    { post } as unknown as ApiClient,
    "https://dev.test",
  );
  const choice = {
    ...input,
    decision: "needs_change" as const,
    note: "The trigger changed.",
  };
  await expect(repo.decideTaskCard(choice)).rejects.toThrow("Offline");
  await repo.decideTaskCard({
    ...choice,
    idempotencyKey: "new-key-after-restart",
  });
  expect(post.mock.calls.map((call) => call[2].idempotencyKey)).toEqual([
    "first-key",
    "first-key",
  ]);
  expect(post.mock.calls[0][2].apiBaseUrl).toBe(
    "https://dev.test/api/mobile/v1x",
  );
  expect(await pendingTaskDecisions()).toEqual([]);
});
it("allow-lists completion state and never returns answer text in team status", async () => {
  const get = jest.fn(async (path: string) =>
    path.endsWith("team-status")
      ? {
          total: 2,
          done: 1,
          answerText: "private words",
          people: [
            { name: "Noah Reed", state: "complete", answer: "secret" },
            { name: "Priya Shah", state: "sent", transcript: "other secret" },
          ],
        }
      : pulse,
  );
  const repo = new HttpParticipantExtrasRepository(
    { get } as unknown as ApiClient,
    "https://dev.test",
  );
  const status = await repo.getTeamStatus("pulse-1");
  expect(status.completeCount).toBe(1);
  expect(status.rows.map((r) => r.status)).toEqual(["COMPLETE", "NOT_STARTED"]);
  expect(JSON.stringify(status)).not.toMatch(
    /private words|secret|answerText|transcript/,
  );
});
it("maps Pulse questions into the same deck and carries the exact version/hash", () => {
  const q = pulseQuestionSet(pulse);
  expect(q.requestId).toBe("pulse:pulse-1");
  expect(q.version).toBe(1);
  expect(q.contentHash).toBe(pulse.contentHash);
  expect(q.questions[0].text).toBe("Is the carrier API still blocked?");
  expect(q.questions.at(-1)?.isElse).toBe(true);
});
it("rejects cross-origin audio URLs before bearer headers can be used", async () => {
  const post = jest.fn(async () => ({
    lines: [
      {
        id: "q1",
        hash: "c".repeat(64),
        url: "https://other.test/collect",
        durationMs: 100,
      },
    ],
  }));
  const repo = new HttpParticipantExtrasRepository(
    { post } as unknown as ApiClient,
    "https://dev.test",
  );
  await expect(
    repo.getVoiceLines({ lines: [{ id: "q1", text: "A question" }] }),
  ).rejects.toMatchObject({ code: "BAD_RESPONSE" });
});
