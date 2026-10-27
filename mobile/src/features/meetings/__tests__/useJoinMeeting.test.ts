import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { act, renderHook } from "@testing-library/react-native";
import { Linking } from "react-native";
import { useJoinMeeting, useNow } from "../useJoinMeeting";
import { useUiStore } from "@/state/ui";
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
}));
beforeEach(() => {
  mockPush.mockClear();
  useUiStore.setState({ toast: null });
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});
test("unsafe or absent meeting link stays in the app with a factual message", async () => {
  const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
  const hook = await renderHook(() =>
    useJoinMeeting("meeting", {
      provider: "ZOOM",
      label: "Zoom",
      url: "javascript:alert(1)",
    }),
  );
  expect(hook.result.current.canOpen).toBe(false);
  await act(async () => {
    await hook.result.current.join();
  });
  expect(open).not.toHaveBeenCalled();
  expect(mockPush).not.toHaveBeenCalled();
  expect(useUiStore.getState().toast?.title).toBe("No join link yet");
  await hook.unmount();
});
test("successful join opens provider then routes to its companion screen", async () => {
  const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
  const hook = await renderHook(() =>
    useJoinMeeting("meeting", {
      provider: "ZOOM",
      label: "Zoom",
      url: "https://zoom.us/j/123",
    }),
  );
  expect(hook.result.current.canOpen).toBe(true);
  await act(async () => {
    await hook.result.current.join();
  });
  expect(open).toHaveBeenCalledWith("https://zoom.us/j/123");
  expect(mockPush).toHaveBeenCalledWith({
    pathname: "/meetings/[meetingId]/live",
    params: { meetingId: "meeting" },
  });
  expect(hook.result.current.joining).toBe(false);
  await hook.unmount();
});
test("failed provider open preserves app location and permits retry", async () => {
  const open = jest
    .spyOn(Linking, "openURL")
    .mockRejectedValue(new Error("app unavailable"));
  const hook = await renderHook(() =>
    useJoinMeeting("meeting", {
      provider: "OTHER",
      label: "Meeting",
      url: "https://example.test/meeting",
    }),
  );
  await act(async () => {
    await hook.result.current.join();
  });
  expect(mockPush).not.toHaveBeenCalled();
  expect(hook.result.current.joining).toBe(false);
  expect(useUiStore.getState().toast?.title).toBe(
    "Couldn't open the meeting link",
  );
  open.mockResolvedValue(undefined);
  await act(async () => {
    await hook.result.current.join();
  });
  expect(mockPush).toHaveBeenCalledTimes(1);
  await hook.unmount();
});
test("wall clock ticks at requested interval and releases timer on unmount", async () => {
  jest.useFakeTimers();
  jest.setSystemTime(1000);
  const hook = await renderHook(() => useNow(250));
  expect(hook.result.current).toBe(1000);
  await act(async () => {
    jest.advanceTimersByTime(250);
  });
  expect(hook.result.current).toBe(1250);
  const clear = jest.spyOn(global, "clearInterval");
  await hook.unmount();
  expect(clear).toHaveBeenCalled();
});
