import React from "react";
import { beforeEach, expect, it, jest } from "@jest/globals";
import { act, render, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useSignOut } from "../useSignOut";
import { useSessionStore } from "@/state/session";
const mockLogout = jest.fn<() => Promise<void>>();
const mockQueue = jest.fn(async () => {});
const mockAudio = jest.fn(async () => {});
const mockPush = jest.fn(async () => {});
const mockTokens = jest.fn(async () => {});
const mockReplace = jest.fn();
jest.mock("@/api", () => ({ useRepository: () => ({ logout: mockLogout }) }));
jest.mock("@/api/extras", () => ({
  clearPendingTaskDecisions: () => mockQueue(),
}));
jest.mock("@/features/voice/out", () => ({
  clearVoiceAudioCache: () => mockAudio(),
}));
jest.mock("@/features/notifications/pushToken", () => ({
  clearStoredPushToken: () => mockPush(),
}));
jest.mock("@/storage/tokens", () => ({
  tokenStore: { clear: () => mockTokens(), get: async () => null },
}));
jest.mock("expo-router", () => ({
  router: { replace: (route: string) => mockReplace(route) },
}));
let leave!: (redirect?: boolean) => Promise<void>;
function Probe() {
  leave = useSignOut().signOutNow;
  return null;
}
beforeEach(() => {
  useSessionStore.setState({ status: "signedIn" });
  mockLogout.mockReset();
  mockQueue.mockClear();
  mockAudio.mockClear();
  mockPush.mockClear();
  mockTokens.mockClear();
  mockReplace.mockClear();
});
async function open() {
  const qc = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity } },
  });
  await render(
    <QueryClientProvider client={qc}>
      <Probe />
    </QueryClientProvider>,
  );
}
it("stops local sync immediately and does not clear a replacement enrollment after delayed logout", async () => {
  let finish!: () => void;
  mockLogout.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await open();
  let running!: Promise<void>;
  await act(async () => {
    running = leave();
  });
  expect(useSessionStore.getState().status).toBe("signedOut");
  await waitFor(() => expect(mockQueue).toHaveBeenCalledTimes(1));
  await act(async () => {
    useSessionStore.setState({ status: "signedIn" });
    finish();
    await running;
  });
  expect(useSessionStore.getState().status).toBe("signedIn");
  expect(mockTokens).not.toHaveBeenCalled();
  expect(mockReplace).not.toHaveBeenCalled();
  expect(mockAudio).toHaveBeenCalledTimes(1);
});
it("still clears local participant data when remote revocation fails", async () => {
  mockLogout.mockRejectedValue(new Error("Offline"));
  await open();
  await act(async () => {
    await leave();
  });
  expect(mockQueue).toHaveBeenCalled();
  expect(mockAudio).toHaveBeenCalled();
  expect(mockPush).toHaveBeenCalled();
  expect(mockTokens).toHaveBeenCalled();
  expect(mockReplace).toHaveBeenCalledWith("/invite");
});
