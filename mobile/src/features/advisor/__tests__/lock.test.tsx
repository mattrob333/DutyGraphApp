import React from "react";
import { AppState } from "react-native";
import { act, render, screen, waitFor } from "@testing-library/react-native";
import { beforeEach, expect, it, jest } from "@jest/globals";
jest.mock("@/features/voice/out", () => ({
  clearVoiceAudioCache: jest.fn(async () => {}),
}));
jest.mock("@/features/voice/meeting", () => ({
  clearMeetingRecordingData: jest.fn(async () => {}),
}));
jest.mock("@/theme", () => ({
  radius: { button: 8 },
  useColors: () => ({
    bg: "white",
    line: "gray",
    nav: "white",
    accentBg: "gray",
    ink: "black",
    muted: "gray",
  }),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@tanstack/react-query", () => {
  const queries = {
    cancelQueries: jest.fn(async () => {}),
    removeQueries: jest.fn(),
  };
  return { useQueryClient: () => queries };
});
jest.mock("expo-local-authentication", () => ({
  authenticateAsync: jest.fn(async () => ({ success: true })),
}));
jest.mock("@/components/common", () => {
  const React = require("react"),
    Native = require("react-native");
  return {
    Heading: Native.Text,
    Text: Native.Text,
    Screen: Native.View,
    LoadingState: () => null,
    TopBar: () => null,
    Button: ({ label, onPress }: { label: string; onPress(): void }) => (
      <Native.Pressable onPress={onPress}>
        <Native.Text>{label}</Native.Text>
      </Native.Pressable>
    ),
  };
});
jest.mock("expo-router", () => {
  const React = require("react"),
    { Text } = require("react-native");
  const counters = { mounts: 0, unmounts: 0 };
  return {
    usePathname: () => "/advisor/meetings/id/live",
    router: { canGoBack: () => false, replace: () => {}, back: () => {} },
    Redirect: () => null,
    Slot: () => {
      React.useEffect(() => {
        counters.mounts++;
        return () => {
          counters.unmounts++;
        };
      }, []);
      return <Text>Protected recorder</Text>;
    },
    counters,
  };
});
import Layout from "@/app/advisor/_layout";
import { useAdvisorStore } from "@/state/advisor";
import * as Authentication from "expo-local-authentication";
beforeEach(() => {
  const { counters } = require("expo-router");
  counters.mounts = 0;
  counters.unmounts = 0;
  useAdvisorStore.setState({
    hydrated: true,
    biometricEnabled: true,
    identity: {
      advisor: { id: "advisor", name: "Alex" },
      company: { id: "company", name: "Larkspur" },
      role: "advisor_mobile",
    },
  });
  jest.clearAllMocks();
});
it("keeps a live recorder mounted behind an inaccessible lock after backgrounding", async () => {
  let changed: (
    state: import("react-native").AppStateStatus,
  ) => void = () => {};
  jest
    .spyOn(AppState, "addEventListener")
    .mockImplementation((_name, listener) => {
      changed = listener;
      return { remove() {} };
    });
  const tree = await render(<Layout />);
  await waitFor(() => expect(require("expo-router").counters.mounts).toBe(1));
  await act(async () => changed("background"));
  expect(screen.getByText("Advisor tools are locked")).toBeTruthy();
  expect(require("expo-router").counters.unmounts).toBe(0);
  expect(
    screen.getByText("Protected recorder", { includeHiddenElements: true }),
  ).toBeTruthy();
  expect(screen.queryByText("Protected recorder")).toBeNull();
  await tree.unmount();
  expect(require("expo-router").counters.unmounts).toBe(1);
});
it("does not mount protected content when the first device unlock fails", async () => {
  jest
    .mocked(Authentication.authenticateAsync)
    .mockResolvedValueOnce({ success: false, error: "user_cancel" });
  await render(<Layout />);
  await waitFor(() =>
    expect(
      screen.getByText("Unlock this phone to open advisor tools."),
    ).toBeTruthy(),
  );
  expect(require("expo-router").counters.mounts).toBe(0);
});
