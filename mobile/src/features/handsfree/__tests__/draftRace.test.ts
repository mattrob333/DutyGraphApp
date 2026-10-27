import { beforeEach, expect, it, jest } from "@jest/globals";
import { buildQuestions } from "@shared/hands-free/hints";
import {
  captureDraftOwner,
  clearAllDrafts,
  clearDraft,
  loadDraft,
  newDraft,
  saveDraft,
  updateDraft,
  useDraftStore,
} from "../draft";
import type { QuestionSet } from "@/types/handsfree";
const mockStorage = new Map<string, string>();
let mockWriteGate: Promise<void> | null = null;
let mockWriting = false;
jest.mock("expo-secure-store", () => ({
  AFTER_FIRST_UNLOCK: 0,
  getItemAsync: async (k: string) => mockStorage.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => {
    if (mockWriteGate) {
      const gate = mockWriteGate;
      mockWriteGate = null;
      mockWriting = true;
      await gate;
    }
    mockStorage.set(k, v);
  },
  deleteItemAsync: async (k: string) => {
    mockStorage.delete(k);
  },
}));
const set: QuestionSet = {
  requestId: "request-race",
  version: 1,
  contentHash: "a".repeat(64),
  title: "Work update",
  advisorName: "Alex Rivera",
  companyName: "Cobalt",
  dueDate: "2026-10-27",
  estimatedMinutes: 1,
  questions: buildQuestions(["Which tools do you use?"]),
  whyAsked: [],
};
function answered(words: string) {
  const d = newDraft(set, "text");
  d.answers[0] = {
    status: "saved",
    raw: words,
    covered: [],
    input: { typed: true },
  };
  return d;
}
beforeEach(async () => {
  await clearAllDrafts();
  mockStorage.clear();
  mockWriteGate = null;
  mockWriting = false;
});
it("rejects an already-dispatched deck callback after logout while preserving a new enrollment draft", async () => {
  const owner = captureDraftOwner();
  const old = answered("Old private words.");
  await saveDraft(old, owner);
  const late = () => {
    const current = useDraftStore.getState().drafts[set.requestId] ?? old;
    return saveDraft({ ...current, answers: old.answers }, owner);
  };
  const clearing = clearAllDrafts();
  const replacement = answered("New participant words.");
  const saving = saveDraft(replacement);
  await late();
  await saveDraft({ ...old });
  await updateDraft(
    set.requestId,
    { edits: { "question.0": "Old edit." } },
    owner,
  );
  await clearDraft(set.requestId, owner);
  await Promise.all([clearing, saving]);
  expect(useDraftStore.getState().drafts[set.requestId]?.answers[0]?.raw).toBe(
    "New participant words.",
  );
  useDraftStore.getState().reset();
  expect((await loadDraft(set))?.answers[0]?.raw).toBe(
    "New participant words.",
  );
  expect([...mockStorage.values()].join(" ")).not.toMatch(
    /Old private|Old edit/,
  );
});
it("serializes in-flight storage writes before logout deletion and replacement writes", async () => {
  let release!: () => void;
  mockWriteGate = new Promise((resolve) => {
    release = resolve;
  });
  const oldSaving = saveDraft(answered("Old buffered recording."));
  for (let i = 0; i < 20 && !mockWriting; i++)
    await new Promise((resolve) => setTimeout(resolve, 1));
  const clearing = clearAllDrafts();
  const newSaving = saveDraft(answered("New reviewed answer."));
  release();
  await Promise.all([oldSaving, clearing, newSaving]);
  useDraftStore.getState().reset();
  expect((await loadDraft(set))?.answers[0]?.raw).toBe("New reviewed answer.");
  expect([...mockStorage.values()].join(" ")).not.toContain(
    "Old buffered recording.",
  );
});
it("rejects old question-version patches and acknowledgements within the same session", async () => {
  const owner = captureDraftOwner();
  await saveDraft({
    ...answered("Current words."),
    contentHash: "b".repeat(64),
  });
  await updateDraft(
    set.requestId,
    {
      understood: [
        { key: "question.0", understood: "Old summary.", suggestion: null },
      ],
    },
    owner,
    set.contentHash,
  );
  await clearDraft(set.requestId, owner, set.contentHash);
  expect(useDraftStore.getState().drafts[set.requestId]?.answers[0]?.raw).toBe(
    "Current words.",
  );
  expect(
    useDraftStore.getState().drafts[set.requestId]?.understood,
  ).toBeUndefined();
});
