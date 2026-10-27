import React from "react";
import { beforeEach, expect, it, jest } from "@jest/globals";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/theme";
import { WrapUpScreen } from "../WrapUpScreen";
import { CompanionApiError } from "@/types/domain";
import type {
  ConfirmationDecisionInput,
  ParticipantConfirmation,
} from "@/api/extras/types";
jest.mock("expo-haptics", () => ({
  impactAsync: async () => {},
  ImpactFeedbackStyle: { Light: "light" },
}));
jest.mock(
  "react-native-safe-area-context",
  () => require("react-native-safe-area-context/jest/mock").default,
);
jest.mock("expo-router", () => ({ router: { replace: jest.fn() } }));
jest.mock("expo-crypto", () => ({ randomUUID: () => "wrapup-retry-key" }));
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
let mockDetail: ParticipantConfirmation;
const mockDecide =
  jest.fn<(input: ConfirmationDecisionInput) => Promise<void>>();
const mockExtras = {
  getConfirmation: async () => mockDetail,
  decideConfirmation: mockDecide,
};
jest.mock("@/api/extras", () => ({
  useParticipantExtrasRepository: () => mockExtras,
}));
const item = {
  id: "item-1",
  proposalId: "proposal-1",
  text: "Confirm the carrier pickup by Tuesday.",
  kind: "action",
  version: 3,
  hash: "a".repeat(64),
  confirmation: "pending",
};
beforeEach(() => {
  mockStorage.clear();
  mockDetail = {
    id: "meeting-1",
    meetingId: "meeting-1",
    title: "Operations review",
    items: [{ ...item }],
  };
  mockDecide.mockReset();
  mockDecide.mockResolvedValue();
});
async function open() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const view = await render(
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <WrapUpScreen id="meeting-1" />
      </ThemeProvider>
    </QueryClientProvider>,
  );
  await waitFor(() =>
    expect(
      screen.queryByText("Operations review") ??
        screen.queryByText("No items need your review"),
    ).toBeTruthy(),
  );
  return { view, qc };
}
it("reloads a stale item and requires a new choice for the new version/hash", async () => {
  mockDecide.mockRejectedValueOnce(
    new CompanionApiError("VERSION_CONFLICT", "The item changed.", 409, false),
  );
  await open();
  await fireEvent.press(screen.getByRole("radio", { name: "Confirm" }));
  await fireEvent.press(screen.getByRole("button", { name: "Send review" }));
  await screen.findByText(/The item changed/);
  mockDetail = {
    ...mockDetail,
    items: [
      {
        ...item,
        text: "Confirm the new pickup window.",
        version: 4,
        hash: "b".repeat(64),
      },
    ],
  };
  await fireEvent.press(
    screen.getByRole("button", { name: "Reload current items" }),
  );
  await screen.findByText("Confirm the new pickup window.");
  expect(screen.getByRole("radio", { name: "Confirm" })).not.toBeChecked();
  expect(screen.getByRole("button", { name: "Send review" })).toBeDisabled();
  await fireEvent.press(screen.getByRole("radio", { name: "Change" }));
  expect(screen.getByRole("button", { name: "Send review" })).toBeDisabled();
  await fireEvent.changeText(
    screen.getByLabelText("Your note for: Confirm the new pickup window."),
    "The window is Wednesday.",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Send review" }));
  await screen.findByText("Sent. Thank you.");
  expect(mockDecide.mock.calls[1][0]).toMatchObject({
    expectedVersion: 4,
    contentHash: "b".repeat(64),
    decision: "change",
    note: "The window is Wednesday.",
  });
});
it("does not ask again for an item the server already acknowledged", async () => {
  mockDetail = {
    ...mockDetail,
    items: [{ ...item, confirmation: "confirmed" }],
  };
  await open();
  expect(await screen.findByText("No items need your review")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Send review" })).toBeNull();
  expect(mockDecide).not.toHaveBeenCalled();
});
it("a live version change clears old choices before the updated item can be sent", async () => {
  const { qc } = await open();
  await fireEvent.press(screen.getByRole("radio", { name: "Confirm" }));
  await act(async () => {
    qc.setQueryData(["participant-confirmation", "meeting-1"], {
      ...mockDetail,
      items: [{ ...item, version: 4, hash: "c".repeat(64) }],
    });
  });
  await waitFor(() =>
    expect(screen.getByRole("radio", { name: "Confirm" })).not.toBeChecked(),
  );
  expect(screen.getByRole("button", { name: "Send review" })).toBeDisabled();
});
