import React from "react";
import { beforeEach, expect, it, jest } from "@jest/globals";
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { ReviewScreen } from "../ReviewScreen";
import { newDraft, useDraftStore } from "../draft";
import {
  FakeRepo,
  REQUEST_ID,
  flush,
  questionSet,
  renderWithProviders,
} from "../__fixtures__/handsFree";
import { CompanionApiError } from "@/types/domain";
import { useUiStore } from "@/state/ui";
import type { BackupClip } from "@/features/voice/backup";
jest.mock("expo-haptics", () => ({
  impactAsync: async () => {},
  ImpactFeedbackStyle: { Light: "light" },
}));
jest.mock(
  "react-native-safe-area-context",
  () => require("react-native-safe-area-context/jest/mock").default,
);
jest.mock("expo-crypto", () => ({ randomUUID: () => "review-retry-key" }));
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
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  router: {
    replace: (...args: unknown[]) => mockReplace(...args),
    dismissTo: jest.fn(),
  },
}));
let mockClips: BackupClip[] = [];
let mockTranscribing = false;
const mockRetry = jest.fn(async () => {});
const mockRemove = jest.fn(async (_id: string) => {});
jest.mock("@/features/participantExtras/useReviewBackups", () => ({
  useReviewBackups: () => ({
    clips: mockClips,
    transcribing: mockTranscribing,
    failed: mockClips.length > 0,
    loading: false,
    retry: mockRetry,
    remove: mockRemove,
  }),
}));
let repo: FakeRepo;
const clip: BackupClip = {
  id: "clip1",
  questionKey: "question.0",
  requestId: REQUEST_ID,
  session: 1,
  uri: "file:///fictional.m4a",
  mimeType: "audio/m4a",
  durationMs: 2000,
};
beforeEach(() => {
  repo = new FakeRepo();
  useDraftStore.setState({ drafts: {} });
  useUiStore.setState({ offline: false });
  mockClips = [];
  mockTranscribing = false;
  mockReplace.mockClear();
  mockRetry.mockClear();
  mockRemove.mockClear();
  mockStore.clear();
});
function seed(raw = "I check the carrier portal.") {
  const d = newDraft(repo.set, "text");
  d.answers[0] = {
    status: "saved",
    raw,
    covered: [],
    input: { voice: "voice_device", typed: true },
  };
  useDraftStore.getState().put(d);
}
it("offers a way back when no draft exists", async () => {
  await renderWithProviders(<ReviewScreen requestId={REQUEST_ID} />, repo);
  await flush();
  expect(screen.getByText("Nothing to review yet.")).toBeTruthy();
  await fireEvent.press(
    screen.getByRole("button", { name: "Back to the questions" }),
  );
  expect(mockReplace).toHaveBeenCalledWith({
    pathname: "/questions/[requestId]/deck",
    params: { requestId: REQUEST_ID, mode: "voice" },
  });
});
it("keeps skipped answers valid and can restart an empty review", async () => {
  const draft = newDraft(repo.set, "text");
  draft.answers = repo.set.questions.map(() => ({
    status: "skipped",
    raw: "",
    covered: [],
    reason: "skip",
  }));
  useDraftStore.getState().put(draft);
  await renderWithProviders(<ReviewScreen requestId={REQUEST_ID} />, repo);
  await flush();
  expect(repo.understands).toHaveLength(0);
  await fireEvent.press(screen.getByRole("button", { name: "Send to Alex" }));
  expect(
    screen.getByText("Answer at least one question before you send."),
  ).toBeTruthy();
  expect(repo.submits).toHaveLength(0);
  await fireEvent.press(
    screen.getAllByRole("button", { name: "Answer now" })[0],
  );
  expect(mockReplace).toHaveBeenLastCalledWith({
    pathname: "/questions/[requestId]/deck",
    params: { requestId: REQUEST_ID, mode: "text" },
  });
  await fireEvent.press(
    screen.getByRole("button", { name: "Start the questions again" }),
  );
  await waitFor(() =>
    expect(useDraftStore.getState().drafts[REQUEST_ID]).toBeUndefined(),
  );
});
it("falls back to original words when understanding rejects and keeps mixed voice source", async () => {
  seed();
  repo.understandAnswers = async () => {
    throw new Error("Service unavailable");
  };
  await renderWithProviders(<ReviewScreen requestId={REQUEST_ID} />, repo);
  await flush();
  expect(screen.getByDisplayValue("I check the carrier portal.")).toBeTruthy();
  expect(
    screen.getByText("Transcribed from voice on your phone · Edited"),
  ).toBeTruthy();
});
it("keeps a refused submission for review and shows the server reason", async () => {
  seed();
  repo.submitError = new CompanionApiError(
    "VERSION_CONFLICT",
    "These questions changed. Review the current version.",
    409,
    false,
  );
  await renderWithProviders(<ReviewScreen requestId={REQUEST_ID} />, repo);
  await flush();
  await fireEvent.press(screen.getByRole("button", { name: "Send to Alex" }));
  await flush();
  expect(
    screen.getByText("These questions changed. Review the current version."),
  ).toBeTruthy();
  expect(mockReplace).not.toHaveBeenCalled();
  expect(useDraftStore.getState().drafts[REQUEST_ID]?.idempotencyKey).toBe(
    "review-retry-key",
  );
});
it("blocks final Send for a failed recording and exposes retry and removal", async () => {
  seed();
  mockClips = [clip];
  await renderWithProviders(<ReviewScreen requestId={REQUEST_ID} />, repo);
  await flush();
  expect(screen.getByRole("button", { name: "Send to Alex" })).toBeDisabled();
  await fireEvent.press(
    screen.getByRole("button", { name: "Try transcription again" }),
  );
  expect(mockRetry).toHaveBeenCalled();
  await fireEvent.press(
    screen.getByRole("button", { name: "Remove recording" }),
  );
  expect(mockRemove).toHaveBeenCalledWith("clip1");
  expect(repo.submits).toHaveLength(0);
});
it("shows a pending transcription without duplicate retry controls", async () => {
  seed();
  mockClips = [clip];
  mockTranscribing = true;
  await renderWithProviders(<ReviewScreen requestId={REQUEST_ID} />, repo);
  await flush();
  expect(screen.getByText("Transcribing your recording…")).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "Try transcription again" }),
  ).toBeNull();
  expect(screen.queryByRole("button", { name: "Remove recording" })).toBeNull();
});
it("routes acknowledged Pulse answers to Pulse completion", async () => {
  repo = new FakeRepo(questionSet(undefined, { requestId: "pulse:pulse-1" }));
  seed();
  await renderWithProviders(
    <ReviewScreen requestId={repo.set.requestId} />,
    repo,
  );
  await flush();
  await fireEvent.press(screen.getByRole("button", { name: "Send to Alex" }));
  await waitFor(() =>
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: "/pulse/[pulseId]/complete",
      params: { pulseId: "pulse-1", acknowledged: "1" },
    }),
  );
  expect(repo.submits[0].requestId).toBe("pulse:pulse-1");
});
