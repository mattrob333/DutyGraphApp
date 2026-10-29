import { beforeEach, it, expect, jest } from "@jest/globals";
import { runPendingEarnCommand } from "../pending-command";
import { secureGetJson, secureSetJson } from "@/storage/secure";
import { tokenStore } from "@/storage/tokens";
let mockStored: unknown = null;
let mockSession: { deviceId: string; localSessionId: string } | null = {
  deviceId: "device",
  localSessionId: "session-a",
};
let mockKey = 0;
jest.mock("@/storage/secure", () => ({
  secureGetJson: jest.fn(async () => mockStored),
  secureSetJson: jest.fn(async (_key: string, value: unknown) => {
    mockStored = JSON.parse(JSON.stringify(value));
  }),
}));
jest.mock("@/storage/tokens", () => ({
  tokenStore: { get: jest.fn(async () => mockSession) },
}));
jest.mock("@/api/http/client", () => ({
  getParticipantSessionGeneration: () => 0,
}));
jest.mock("@/utils/id", () => ({
  newIdempotencyKey: () => `key-${++mockKey}`,
}));
beforeEach(() => {
  mockStored = null;
  mockSession = { deviceId: "device", localSessionId: "session-a" };
  jest.clearAllMocks();
});
it.each(["create-fix", "create-draft", "confirm-draft"])(
  "retains %s command across lost response and a fresh invocation",
  async (operation) => {
    const rows = new Map<string, unknown>();
    const keys: string[] = [];
    const body = { words: "Reviewed exact words", version: 1 };
    const first = async (key: string) => {
      keys.push(key);
      rows.set(key, body);
      throw new Error("Response lost");
    };
    await expect(runPendingEarnCommand(operation, body, first)).rejects.toThrow(
      "Response lost",
    );
    expect(mockStored).toEqual([
      expect.objectContaining({
        operation,
        body,
        sessionId: "device:session-a",
        key: keys[0],
      }),
    ]);
    // New invocation has no component state or previous closure. Durable record is the sole source of the key.
    await runPendingEarnCommand(operation, { ...body }, async (key) => {
      keys.push(key);
      rows.set(key, body);
      return { acknowledged: true };
    });
    expect(keys[1]).toBe(keys[0]);
    expect(rows.size).toBe(1);
    expect(mockStored).toEqual([]);
  },
);
it("blocks network if durable storage fails", async () => {
  jest
    .mocked(secureSetJson)
    .mockRejectedValueOnce(new Error("Keychain unavailable"));
  const send = jest.fn(async (_key: string) => undefined);
  await expect(
    runPendingEarnCommand("create-fix", { text: "fix" }, send),
  ).rejects.toThrow("Keychain unavailable");
  expect(send).not.toHaveBeenCalled();
});
it("never reuses another session pending identity, and logout blocks send", async () => {
  let firstKey = "";
  await expect(
    runPendingEarnCommand("create-fix", { text: "fix" }, async (key) => {
      firstKey = key;
      throw Error("lost");
    }),
  ).rejects.toThrow();
  mockSession = { deviceId: "device", localSessionId: "session-b" };
  await runPendingEarnCommand("create-fix", { text: "fix" }, async (key) => {
    expect(key).not.toBe(firstKey);
    return true;
  });
  expect(mockStored).toEqual([
    expect.objectContaining({ sessionId: "device:session-a", key: firstKey }),
  ]);
  mockSession = null;
  const send = jest.fn(async (_key: string) => undefined);
  await expect(runPendingEarnCommand("create-fix", {}, send)).rejects.toThrow(
    "Sign in",
  );
  expect(send).not.toHaveBeenCalled();
});
it("fences session replacement while storage is pending and while awaiting acknowledgement", async () => {
  jest.mocked(secureSetJson).mockImplementationOnce(async () => {
    mockSession = { deviceId: "device", localSessionId: "session-b" };
  });
  const send = jest.fn(async (_key: string) => undefined);
  await expect(runPendingEarnCommand("create-fix", {}, send)).rejects.toThrow(
    "session changed",
  );
  expect(send).not.toHaveBeenCalled();
  mockSession = { deviceId: "device", localSessionId: "session-a" };
  await expect(
    runPendingEarnCommand("create-draft", {}, async () => {
      mockSession = { deviceId: "device", localSessionId: "session-b" };
      return true;
    }),
  ).rejects.toThrow("session changed");
  expect(mockStored).toEqual([
    expect.objectContaining({
      sessionId: "device:session-a",
      operation: "create-draft",
    }),
  ]);
  expect(tokenStore.get).toHaveBeenCalled();
  expect(secureGetJson).toHaveBeenCalled();
});
