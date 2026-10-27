import React from "react";
import { afterEach, beforeEach, expect, it, jest } from "@jest/globals";
import { act, render } from "@testing-library/react-native";
import { AppState } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useSessionStore } from "@/state/session";
import { usePendingTaskDecisionSync } from "../usePendingTaskDecisionSync";
const mockRetry = jest.fn<() => Promise<{ acknowledged: boolean }[]>>();
const mockClear = jest.fn(async () => {});
const mockExtras = { retryPendingTaskDecisions: mockRetry };
jest.mock("@/api/extras", () => ({
  useParticipantExtrasRepository: () => mockExtras,
  clearPendingTaskDecisions: () => mockClear(),
}));
jest.mock("expo-secure-store", () => ({
  getItemAsync: async () => null,
  deleteItemAsync: async () => {},
}));
function Sync() {
  usePendingTaskDecisionSync();
  return null;
}
let onState: ((state: string) => void) | undefined;
beforeEach(() => {
  jest.useFakeTimers();
  useSessionStore.setState({ status: "signedOut" });
  mockRetry.mockReset();
  mockRetry.mockResolvedValue([]);
  jest
    .spyOn(AppState, "addEventListener")
    .mockImplementation((_event, callback) => {
      onState = callback as (state: string) => void;
      return { remove: jest.fn() };
    });
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});
it("stays inactive without a participant and retries on launch, foreground and sixty seconds", async () => {
  const qc = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity } },
  });
  const view = await render(
    <QueryClientProvider client={qc}>
      <Sync />
    </QueryClientProvider>,
  );
  expect(mockRetry).not.toHaveBeenCalled();
  await act(async () => {
    useSessionStore.setState({ status: "signedIn" });
  });
  expect(mockRetry).toHaveBeenCalledTimes(1);
  await act(async () => {
    onState?.("background");
  });
  expect(mockRetry).toHaveBeenCalledTimes(1);
  await act(async () => {
    onState?.("active");
  });
  expect(mockRetry).toHaveBeenCalledTimes(2);
  await act(async () => {
    jest.advanceTimersByTime(60000);
  });
  expect(mockRetry).toHaveBeenCalledTimes(3);
  await act(async () => {
    useSessionStore.setState({ status: "signedOut" });
  });
  await act(async () => {
    jest.advanceTimersByTime(60000);
  });
  expect(mockRetry).toHaveBeenCalledTimes(3);
  await view.unmount();
});
