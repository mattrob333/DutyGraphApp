import { act, renderHook } from "@testing-library/react-native";
import { beforeEach, expect, jest, test } from "@jest/globals";
jest.mock("@/api/advisor", () => ({
  getAdvisorRepository: () => ({ kind: "http" }),
}));
jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: async () => {} }),
}));
jest.mock("expo-secure-store", () => {
  const { secureMap } = require("../../../api/http/testUtils");
  return {
    AFTER_FIRST_UNLOCK: 1,
    getItemAsync: async (key: string) => secureMap.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => {
      secureMap.set(key, value);
    },
    deleteItemAsync: async (key: string) => {
      secureMap.delete(key);
    },
  };
});
import { clearAdvisorData } from "@/storage/advisor";
import { CompanionApiError } from "@/api/http/errors";
import { useCommand } from "../useCommand";
import * as Crypto from "expo-crypto";
beforeEach(async () => {
  await clearAdvisorData();
  let sequence = 0;
  jest
    .spyOn(Crypto, "randomUUID")
    .mockImplementation(
      () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`,
    );
});
test("restart and ambiguous finish outcomes retain the exact key until the server proves terminal failure", async () => {
  const keys: string[] = [];
  const first = await renderHook(useCommand);
  await act(async () => {
    await first.result.current.run(
      ["finish", "session"],
      async (_repo, key) => {
        keys.push(key);
        throw new CompanionApiError("NETWORK_OFFLINE", "No response", 0, true);
      },
    );
  });
  await first.unmount();
  const next = await renderHook(useCommand);
  for (const code of ["COMMAND_PENDING", "REQUEST_TIMEOUT", "COMMAND_FAILED"]) {
    await act(async () => {
      await next.result.current.run(
        ["finish", "session"],
        async (_repo, key) => {
          keys.push(key);
          throw new CompanionApiError(code, "Previous attempt", 409, false);
        },
      );
    });
  }
  expect(new Set(keys).size).toBe(1);
  expect((next.result.current.error as Error).message).toContain(
    "Tap Review closing",
  );
  await act(async () => {
    await next.result.current.run(["finish", "session"], async (_repo, key) => {
      keys.push(key);
      return true;
    });
  });
  expect(keys.at(-1)).not.toBe(keys[0]);
  await next.unmount();
});
