import React from "react";
import { expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { ThemeProvider } from "@/theme";
import { ClosingRitual } from "../ClosingRitual";
import type { MeetingDefinition, SessionDetail } from "@/api/advisor";
jest.mock("expo-haptics", () => ({
  impactAsync: async () => {},
  ImpactFeedbackStyle: { Light: "light" },
}));
const meeting = {
  power: { outcomes: ["Launch decision", "Credentials"] },
  state: "REVIEW_PENDING",
} as MeetingDefinition;
const session = {
  version: 3,
  hash: "current-hash",
  consents: [{ personKey: "dana", name: "Dana Whitlock", state: "consented" }],
  outcomeReviews: [],
  closingReadiness: {
    complete: false,
    partial: false,
    missingOutcomes: 2,
    unconfirmedActions: 0,
  },
} as unknown as SessionDetail;
it("requires every disposition and an owner/date for deferral; retains failed save drafts", async () => {
  const onSave = jest.fn(async () => false);
  await render(
    <ThemeProvider>
      <ClosingRitual
        meeting={meeting}
        session={session}
        busy={false}
        onSave={onSave}
        onComplete={() => {}}
      />
    </ThemeProvider>,
  );
  expect(
    screen.getByRole("button", { name: "Complete meeting" }).props
      .accessibilityState.disabled,
  ).toBe(true);
  await fireEvent.press(
    screen.getByRole("button", { name: "Met: Launch decision" }),
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Deferred: Credentials" }),
  );
  expect(
    screen.getByRole("button", { name: "Save outcome review" }).props
      .accessibilityState.disabled,
  ).toBe(true);
  await fireEvent.press(screen.getByRole("button", { name: "Dana Whitlock" }));
  await fireEvent.changeText(
    screen.getByLabelText("Follow-up date: Credentials"),
    "2026-11-03T14:00:00-05:00",
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Save outcome review" }),
  );
  expect(onSave).toHaveBeenCalledWith({
    outcomes: [
      {
        outcomeId: "outcome-1",
        status: "met",
        ownerPersonKey: null,
        dueAt: null,
      },
      {
        outcomeId: "outcome-2",
        status: "deferred",
        ownerPersonKey: "dana",
        dueAt: "2026-11-03T19:00:00.000Z",
      },
    ],
    followUpPlan: "",
    expectedVersion: 3,
    contentHash: "current-hash",
  });
  expect(screen.getByLabelText("Follow-up date: Credentials").props.value).toBe(
    "2026-11-03T14:00:00-05:00",
  );
});
it("waits for server completion acknowledgment and requires partial-outcome follow-up", async () => {
  const onComplete = jest.fn();
  const saved = {
    ...session,
    outcomeReviews: [
      {
        outcomeId: "outcome-1",
        status: "met" as const,
        ownerPersonKey: null,
        dueAt: null,
      },
      {
        outcomeId: "outcome-2",
        status: "dropped" as const,
        ownerPersonKey: null,
        dueAt: null,
      },
    ],
    closingReadiness: {
      complete: true,
      partial: false,
      missingOutcomes: 0,
      unconfirmedActions: 0,
    },
  };
  const tree = await render(
    <ThemeProvider>
      <ClosingRitual
        meeting={meeting}
        session={saved}
        busy={false}
        onSave={async () => true}
        onComplete={onComplete}
      />
    </ThemeProvider>,
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Complete meeting" }),
  );
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(screen.queryByText(/Meeting complete\./)).toBeNull();
  await fireEvent.press(
    screen.getByRole("button", { name: "Partly met: Launch decision" }),
  );
  expect(
    screen.getByRole("button", { name: "Save outcome review" }).props
      .accessibilityState.disabled,
  ).toBe(true);
  await fireEvent.changeText(
    screen.getByLabelText("Follow-up plan"),
    "Dana will check on Tuesday.",
  );
  expect(
    screen.getByRole("button", { name: "Save outcome review" }).props
      .accessibilityState.disabled,
  ).toBe(false);
  await tree.rerender(
    <ThemeProvider>
      <ClosingRitual
        meeting={{ ...meeting, state: "COMPLETE" }}
        session={saved}
        busy={false}
        onSave={async () => true}
        onComplete={onComplete}
      />
    </ThemeProvider>,
  );
  expect(
    screen.getByText(/Meeting complete\. The server acknowledged/),
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Complete meeting" })).toBeNull();
});

it("requires explicit reload when the server review changes during a local edit", async () => {
  const onSave = jest.fn(async () => true);
  const tree = await render(
    <ThemeProvider>
      <ClosingRitual
        meeting={meeting}
        session={session}
        busy={false}
        onSave={onSave}
        onComplete={() => {}}
      />
    </ThemeProvider>,
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Met: Launch decision" }),
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Met: Credentials" }),
  );
  await tree.rerender(
    <ThemeProvider>
      <ClosingRitual
        meeting={meeting}
        session={{ ...session, version: 4, hash: "new-hash" }}
        busy={false}
        onSave={onSave}
        onComplete={() => {}}
      />
    </ThemeProvider>,
  );
  expect(
    screen.getByRole("button", { name: "Save outcome review" }).props
      .accessibilityState.disabled,
  ).toBe(true);
  await fireEvent.press(
    screen.getByRole("button", { name: "Save outcome review" }),
  );
  expect(onSave).not.toHaveBeenCalled();
  await fireEvent.press(
    screen.getByRole("button", { name: "Reload outcome review" }),
  );
  expect(
    screen.queryByRole("button", { name: "Reload outcome review" }),
  ).toBeNull();
});
