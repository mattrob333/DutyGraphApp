import { beforeEach, expect, it, jest } from "@jest/globals";
import {
  clearAllTaskReviews,
  clearTaskReview,
  loadReviewValue,
  saveReviewValue,
} from "../reviewStore";
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
beforeEach(async () => {
  await clearAllTaskReviews();
  mockStorage.clear();
});
it("a late acknowledgement removes only the exact draft sent, preserving a newer review", async () => {
  const sent = { choices: { item: { decision: "confirm" } }, hash: "old" };
  await saveReviewValue("wrapup:meeting", sent);
  const newer = {
    choices: { item: { note: "Please use Wednesday." } },
    hash: "new",
  };
  await saveReviewValue("wrapup:meeting", newer);
  await clearTaskReview("wrapup:meeting", sent);
  expect(await loadReviewValue("wrapup:meeting")).toEqual(newer);
  await clearTaskReview("wrapup:meeting", newer);
  expect(await loadReviewValue("wrapup:meeting")).toBeNull();
});
it("serializes cleanup after outstanding draft writes", async () => {
  const writing = saveReviewValue("request", { note: "A private correction." });
  await clearAllTaskReviews();
  await writing;
  expect(await loadReviewValue("request")).toBeNull();
});
it("does not erase a replacement session review queued after logout cleanup begins", async () => {
  await saveReviewValue("old", { note: "Old person" });
  const clearing = clearAllTaskReviews();
  const fresh = saveReviewValue("new", { note: "New person" });
  await Promise.all([clearing, fresh]);
  expect(await loadReviewValue("old")).toBeNull();
  expect(await loadReviewValue("new")).toEqual({ note: "New person" });
});
