import React from "react";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/theme";
import { TaskCheckScreen } from "../TaskCheckScreen";
import type { TaskCardRecord, TaskDecisionInput } from "@/api/extras/types";
jest.mock("expo-haptics", () => ({
  impactAsync: async () => {},
  ImpactFeedbackStyle: { Light: "light" },
}));
jest.mock(
  "react-native-safe-area-context",
  () => require("react-native-safe-area-context/jest/mock").default,
);
jest.mock("expo-crypto", () => ({ randomUUID: () => "stable-task-key" }));
jest.mock("expo-router", () => ({
  router: { replace: jest.fn() },
  useFocusEffect: () => {},
}));
jest.mock("@/features/voice/out", () => ({
  createVoiceOut: () => ({
    prepare: async () => {},
    play: async () => {},
    stop: () => {},
    dispose: async () => {},
  }),
}));
jest.mock("@/hooks/queries", () => ({
  qk: { today: ["today"] },
  useMe: () => ({ data: { voicePreferences: { speakQuestions: true } } }),
}));
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
let mockCards: TaskCardRecord[];
const mockDecide = jest.fn<
  (input: TaskDecisionInput) => Promise<{
    acknowledged: boolean;
    pending: boolean;
    taskCardId: string;
  }>
>();
const mockExtras = {
  getTaskCards: async () => mockCards,
  getPendingTaskDecisions: async () => [],
  decideTaskCard: mockDecide,
};
jest.mock("@/api/extras", () => ({
  useParticipantExtrasRepository: () => mockExtras,
}));
const card: TaskCardRecord = {
  id: "task-1",
  title: "Book carrier pickups",
  version: 3,
  hash: "a".repeat(64),
  state: "proposed",
  needsAttestation: true,
  reviewed: false,
  data: { duty: "Ship orders on time", trigger: "A pallet is packed" },
};
async function open() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const view = await render(
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <TaskCheckScreen requestId="request-1" />
      </ThemeProvider>
    </QueryClientProvider>,
  );
  await screen.findByText("Does this describe your work?");
  return Object.assign(view, { qc });
}
beforeEach(() => {
  mockStore.clear();
  mockCards = [{ ...card }];
  mockDecide.mockReset();
  mockDecide.mockImplementation(async (input) => ({
    acknowledged: true,
    pending: false,
    taskCardId: input.taskCardId,
  }));
});
describe("Task Card review", () => {
  it("requires an explicit choice, and waits for the server after review and Send", async () => {
    let acknowledge!: () => void;
    mockDecide.mockImplementation(
      (input) =>
        new Promise((resolve) => {
          acknowledge = () =>
            resolve({
              acknowledged: true,
              pending: false,
              taskCardId: input.taskCardId,
            });
        }),
    );
    await open();
    await fireEvent.changeText(
      screen.getByLabelText("Add a note (optional)"),
      "The description reads right.",
    );
    expect(
      screen.getByRole("button", { name: "Review choices" }),
    ).toBeDisabled();
    await fireEvent.press(screen.getByRole("radio", { name: "This is right" }));
    await fireEvent.press(
      screen.getByRole("button", { name: "Review choices" }),
    );
    expect(mockDecide).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "Send review" }));
    await waitFor(() => expect(mockDecide).toHaveBeenCalled());
    expect(screen.queryByText("Sent. Thank you.")).toBeNull();
    expect(mockDecide.mock.calls[0][0]).toMatchObject({
      taskCardId: "task-1",
      recordVersion: 3,
      contentHash: card.hash,
      decision: "correct",
      note: undefined,
      idempotencyKey: "stable-task-key",
    });
    await act(async () => acknowledge());
    expect(await screen.findByText("Sent. Thank you.")).toBeTruthy();
  });
  it("labels unsupported choices as waiting and retries with the persisted key", async () => {
    mockDecide.mockImplementation(async (input) => ({
      acknowledged: false,
      pending: true,
      taskCardId: input.taskCardId,
    }));
    await open();
    await fireEvent.press(screen.getByRole("radio", { name: "Not my work" }));
    await fireEvent.changeText(
      screen.getByLabelText("Add a note (optional)"),
      "Priya books these.",
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Review choices" }),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Send review" }));
    expect(await screen.findByText("Saved on this phone")).toBeTruthy();
    expect(screen.queryByText("Sent. Thank you.")).toBeNull();
    expect(
      screen.getByText("Your advisor will see this when your app is updated."),
    ).toBeTruthy();
    await fireEvent.press(
      screen.getByRole("button", { name: "Try sending again" }),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Send review" }));
    await waitFor(() => expect(mockDecide).toHaveBeenCalledTimes(2));
    expect(mockDecide.mock.calls.map((c) => c[0].idempotencyKey)).toEqual([
      "stable-task-key",
      "stable-task-key",
    ]);
  });
  it("restores choices for the same exact card and rejects choices from an old hash", async () => {
    const first = await open();
    await fireEvent.press(
      screen.getByRole("radio", { name: "Needs a change" }),
    );
    await fireEvent.changeText(
      screen.getByLabelText("Add a note (optional)"),
      "We use the carrier portal now.",
    );
    await first.unmount();
    const second = await open();
    expect(screen.getByRole("radio", { name: "Needs a change" })).toBeChecked();
    expect(
      screen.getByDisplayValue("We use the carrier portal now."),
    ).toBeTruthy();
    await second.unmount();
    mockCards = [{ ...card, version: 4, hash: "b".repeat(64) }];
    await open();
    expect(
      screen.getByRole("radio", { name: "Needs a change" }),
    ).not.toBeChecked();
    expect(
      screen.getByDisplayValue("We use the carrier portal now."),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Review choices" }),
    ).toBeDisabled();
  });
});

it("discards choices immediately when live data changes and resets an out-of-range card index", async () => {
  mockCards = [card, { ...card, id: "task-2", title: "Keep records" }];
  const view = await open();
  await fireEvent.press(screen.getByRole("radio", { name: "This is right" }));
  await fireEvent.press(screen.getByRole("button", { name: "Next Task Card" }));
  expect(screen.getByText("Keep records")).toBeTruthy();
  await act(async () => {
    view.qc.setQueryData(
      ["task-check", "request-1"],
      [{ ...card, version: 4, hash: "c".repeat(64) }],
    );
  });
  expect(await screen.findByText("Book carrier pickups")).toBeTruthy();
  expect(
    screen.getByRole("radio", { name: "This is right" }),
  ).not.toBeChecked();
  expect(screen.getByRole("button", { name: "Review choices" })).toBeDisabled();
});
