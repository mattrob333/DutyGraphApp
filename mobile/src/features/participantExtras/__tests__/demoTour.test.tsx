import React from "react";
import { beforeEach, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { ThemeProvider } from "@/theme";
import { DemoTourScreen, DEMO_TOUR_STEPS } from "../DemoTourScreen";
jest.mock("expo-haptics", () => ({
  impactAsync: async () => {},
  ImpactFeedbackStyle: { Light: "light" },
}));
jest.mock(
  "react-native-safe-area-context",
  () => require("react-native-safe-area-context/jest/mock").default,
);
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  router: { push: (route: unknown) => mockPush(route) },
}));
let mockKind = "mock";
let mockIdentity: unknown = { company: { id: "fictional-company" } };
jest.mock("@/api", () => ({ useRepository: () => ({ kind: mockKind }) }));
jest.mock("@/state/advisor", () => ({
  useAdvisorStore: (select: (state: unknown) => unknown) =>
    select({ identity: mockIdentity }),
}));
beforeEach(() => {
  mockKind = "mock";
  mockIdentity = { company: { id: "fictional-company" } };
  mockPush.mockClear();
});
it("opens every A–H flow with one tap and never starts a command", async () => {
  await render(
    <ThemeProvider>
      <DemoTourScreen />
    </ThemeProvider>,
  );
  for (const step of DEMO_TOUR_STEPS) {
    await fireEvent.press(
      screen.getByRole("button", { name: `${step.id}. ${step.title}` }),
    );
    expect(mockPush).toHaveBeenLastCalledWith(step.route);
  }
  expect(mockPush).toHaveBeenCalledTimes(8);
});
it("uses real pairing when needed and keeps the tour out of HTTP mode", async () => {
  mockIdentity = null;
  const view = await render(
    <ThemeProvider>
      <DemoTourScreen />
    </ThemeProvider>,
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "E. Plan a meeting" }),
  );
  expect(mockPush).toHaveBeenLastCalledWith("/advisor/pair");
  await view.unmount();
  mockKind = "http";
  await render(
    <ThemeProvider>
      <DemoTourScreen />
    </ThemeProvider>,
  );
  expect(screen.getByText("Demo tour is unavailable")).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "Open spoken interview" }),
  ).toBeNull();
});
