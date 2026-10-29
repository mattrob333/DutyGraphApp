import React from "react";
import { expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { ThemeProvider } from "@/theme";
import { ClosingResponse } from "../ClosingResponse";

jest.mock("expo-haptics", () => ({
  impactAsync: async () => {},
  ImpactFeedbackStyle: { Light: "light" },
}));

it("requires a change note and retains it after an unsuccessful response", async () => {
  const onRespond = jest.fn();
  const tree = await render(
    <ThemeProvider><ClosingResponse busy={false} onRespond={onRespond} /></ThemeProvider>,
  );
  const change = screen.getByRole("button", { name: "Change" });
  expect(change.props.accessibilityState.disabled).toBe(true);
  await fireEvent.changeText(screen.getByLabelText("What needs to change?"), "   ");
  await fireEvent.press(change);
  expect(onRespond).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByLabelText("What needs to change?"), "  The owner is Jordan.  ");
  await fireEvent.press(screen.getByRole("button", { name: "Change" }));
  expect(onRespond).toHaveBeenCalledWith("changed", "The owner is Jordan.");
  await tree.rerender(
    <ThemeProvider><ClosingResponse busy={false} onRespond={onRespond} /></ThemeProvider>,
  );
  expect(screen.getByLabelText("What needs to change?").props.value).toBe("  The owner is Jordan.  ");
});

it("lets the owner confirm or say not mine without a change note", async () => {
  const onRespond = jest.fn();
  await render(<ThemeProvider><ClosingResponse busy={false} onRespond={onRespond} /></ThemeProvider>);
  await fireEvent.press(screen.getByRole("button", { name: "Confirm" }));
  await fireEvent.press(screen.getByRole("button", { name: "Not mine" }));
  expect(onRespond.mock.calls).toEqual([["confirmed", undefined], ["not_mine", undefined]]);
});
