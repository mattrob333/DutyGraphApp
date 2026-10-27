import { beforeEach, expect, jest, test } from "@jest/globals";
import * as SecureStore from "expo-secure-store";
import { secureDelete, secureGet, secureSet } from "../secure";

jest.mock("expo-secure-store", () => ({
  AFTER_FIRST_UNLOCK: "after-first-unlock",
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const values = new Map<string, string>();
beforeEach(() => {
  values.clear();
  jest
    .mocked(SecureStore.getItemAsync)
    .mockImplementation(async (key) => values.get(key) ?? null);
  jest
    .mocked(SecureStore.setItemAsync)
    .mockImplementation(async (key, value) => {
      values.set(key, value);
    });
  jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async (key) => {
    values.delete(key);
  });
});

test("an interrupted replacement preserves the previously committed large draft", async () => {
  const saved = "original ".repeat(700);
  await secureSet("draft", saved);
  let writes = 0;
  jest
    .mocked(SecureStore.setItemAsync)
    .mockImplementation(async (key, value) => {
      if (++writes === 2) throw new Error("storage unavailable");
      values.set(key, value);
    });
  await expect(secureSet("draft", "replacement ".repeat(700))).rejects.toThrow(
    "storage unavailable",
  );
  expect(await secureGet("draft")).toBe(saved);
});

test("overlapping saves commit complete values and delete clears the chunks", async () => {
  await Promise.all([
    secureSet("draft", "a".repeat(5000)),
    secureSet("draft", "b".repeat(6500)),
  ]);
  expect(await secureGet("draft")).toBe("b".repeat(6500));
  await secureDelete("draft");
  expect(await secureGet("draft")).toBeNull();
  expect(values.size).toBe(0);
});

test("reads legacy chunked drafts and migrates safely on the next save", async () => {
  values.set("draft", "chunks:2");
  values.set("draft.0", "old ");
  values.set("draft.1", "draft");
  expect(await secureGet("draft")).toBe("old draft");
  await secureSet("draft", "new draft");
  expect(await secureGet("draft")).toBe("new draft");
  expect([...values.keys()]).toEqual(["draft"]);
});
