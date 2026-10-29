import React from "react";
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import type { DraftCreation, TaskCardDraft } from "@/api/earn/types";
import type { EarnRepository } from "@/api/earn/repository";

let mockPending: unknown = null;
let mockKeySequence = 0;
jest.mock("@/storage/tokens", () => ({
  tokenStore: {
    get: async () => ({
      deviceId: "voice-device",
      localSessionId: "voice-enrollment",
    }),
  },
}));
jest.mock("@/storage/secure", () => ({
  secureGetJson: async () => mockPending,
  secureSetJson: async (_key: string, value: unknown) => {
    mockPending = JSON.parse(JSON.stringify(value));
  },
}));
jest.mock("expo-haptics", () => ({
  impactAsync: async () => {},
  ImpactFeedbackStyle: { Light: "light" },
}));
jest.mock("expo-crypto", () => ({
  randomUUID: () => `fictional-voice-intent-key-${++mockKeySequence}`,
}));
jest.mock("expo-router", () => ({
  router: { replace: jest.fn() },
  useFocusEffect: (effect: () => () => void) =>
    require("react").useEffect(effect, [effect]),
}));
jest.mock("@/features/voice/live", () => ({
  createLiveSpeech: jest.fn(() => ({
    kind: "unavailable",
    start: jest.fn(async () => {}),
    stop: jest.fn(async () => {}),
  })),
}));
import { setEarnRepository } from "@/api/earn";
import { RepositoryProvider } from "@/api";
import { createLiveSpeech } from "@/features/voice/live";
import { ThemeProvider } from "@/theme";
import { VoiceTaskScreen } from "../VoiceTaskScreen";
const seededDraft = {
  id: "fictional-saved-draft",
  state: "waiting",
} as TaskCardDraft;
function repository(
  capability: boolean,
  save: EarnRepository["createDraftFromTask"],
) {
  const notUsed = async (): Promise<never> => {
    throw new Error("Unexpected repository operation");
  };
  return {
    getSummary: notUsed,
    listDrafts: notUsed,
    getDraft: notUsed,
    confirmDraft: notUsed,
    notMine: notUsed,
    getTeamBoard: notUsed,
    getGaps: notUsed,
    createFix: notUsed,
    supportsDraftCreation: async () => capability,
    createDraftFromTask: save,
  } satisfies EarnRepository;
}
afterEach(() => {
  mockPending = null;
  setEarnRepository(null);
  jest.clearAllMocks();
});
async function show(repo: EarnRepository) {
  setEarnRepository(repo);
  return render(
    <RepositoryProvider>
      <ThemeProvider>
        <VoiceTaskScreen />
      </ThemeProvider>
    </RepositoryProvider>,
  );
}
async function typeTask() {
  await waitFor(() => expect(screen.getByLabelText("Task name")).toBeTruthy());
  await fireEvent.changeText(
    screen.getByLabelText("Task name"),
    "Check returned parts",
  );
  await fireEvent.changeText(
    screen.getByLabelText("Part of my job"),
    "Check returns",
  );
  await fireEvent.changeText(
    screen.getByLabelText("Task words"),
    "Count each tray. Tell the stores lead.",
  );
}
describe("Earn voice task destination and acknowledgement", () => {
  it("refuses unsupported connections before constructing any microphone transport", async () => {
    const save = jest.fn(async (): Promise<DraftCreation> => ({
      drafts: [],
      refused: [],
    }));
    await show(repository(false, save));
    await waitFor(() =>
      expect(
        screen.getByText(/Saving a new Task Card here is not turned on/),
      ).toBeTruthy(),
    );
    expect(createLiveSpeech).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Task words")).toBeNull();
  });
  it("saves only reviewed words as a draft and waits for server acknowledgement", async () => {
    let resolve!: (value: DraftCreation) => void;
    const completion = new Promise<DraftCreation>((done) => {
      resolve = done;
    });
    const save = jest.fn<EarnRepository["createDraftFromTask"]>(
      () => completion,
    );
    await show(repository(true, save));
    await typeTask();
    await fireEvent.press(
      screen.getByRole("button", { name: "Save app draft" }),
    );
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Draft saved")).toBeNull();
    expect(save.mock.calls[0][0]).toMatchObject({
      title: "Check returned parts",
      slots: {
        does: {
          value: "Count each tray. Tell the stores lead.",
          basis: "told_me",
        },
      },
      steps: [],
    });
    await act(async () => {
      resolve({ drafts: [seededDraft], refused: [] });
      await completion;
    });
    await waitFor(() => expect(screen.getByText("Draft saved")).toBeTruthy());
    expect(screen.getByText(/still a draft/)).toBeTruthy();
  });
  it("retains a failed intent key for a manual retry without inventing completion", async () => {
    const save = jest
      .fn<EarnRepository["createDraftFromTask"]>()
      .mockRejectedValueOnce(new Error("Connection interrupted."))
      .mockResolvedValueOnce({ drafts: [seededDraft], refused: [] });
    const first = await show(repository(true, save));
    await typeTask();
    await fireEvent.press(
      screen.getByRole("button", { name: "Save app draft" }),
    );
    await waitFor(() =>
      expect(screen.getByText("Connection interrupted.")).toBeTruthy(),
    );
    expect(screen.queryByText("Draft saved")).toBeNull();
    await first.unmount();
    await show(repository(true, save));
    await typeTask();
    await fireEvent.press(
      screen.getByRole("button", { name: "Save app draft" }),
    );
    await waitFor(() => expect(screen.getByText("Draft saved")).toBeTruthy());
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[0][1]).toBe(save.mock.calls[1][1]);
  });
});
