import React from "react";
import { expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { ThemeProvider } from "@/theme";
import { MeetingGateSuggestion } from "../MeetingGateSuggestion";
import type { MeetingGateSuggestionWire } from "@/api/advisor";
const deterministic: MeetingGateSuggestionWire["deterministic"] = {
  mode: "LIVE",
  route: "LIVE",
  reason: "An authorized person must decide.",
  requiredPersonIds: [],
  releasedPersonIds: [],
  liveMinutes: 25,
  asyncTopicIds: [],
  judgedBy: "rules",
};
it("requests advice only on a tap and labels the reason as a suggestion", async () => {
  const onRequest = jest.fn(
    async () =>
      ({
        deterministic,
        suggestion: {
          suggestion: "shorten",
          reason: "Only one open question remains.",
        },
        status: "suggestion",
        simulated: true,
      }) as MeetingGateSuggestionWire,
  );
  await render(
    <ThemeProvider>
      <MeetingGateSuggestion busy={false} onRequest={onRequest} />
    </ThemeProvider>,
  );
  expect(onRequest).not.toHaveBeenCalled();
  await fireEvent.press(
    screen.getByRole("button", { name: "Ask AI for a suggestion" }),
  );
  expect(onRequest).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Simulated AI suggestion")).toBeTruthy();
  expect(screen.getByText("Suggestion: Shorten the meeting")).toBeTruthy();
  expect(screen.getByText("Only one open question remains.")).toBeTruthy();
  expect(
    screen.getByText(
      "This is a suggestion. It does not change the rules result or your meeting plan.",
    ),
  ).toBeTruthy();
});
it.each([
  ["off", "AI meeting suggestions are off for this company."],
  ["unavailable", "An AI suggestion is unavailable."],
  ["over_budget", "The company’s AI allowance has been reached."],
  [
    "rules_required",
    "The rules require more planning or an authorized person.",
  ],
])("preserves the rules when %s", async (status, copy) => {
  await render(
    <ThemeProvider>
      <MeetingGateSuggestion
        busy={false}
        onRequest={async () =>
          ({
            deterministic,
            suggestion: null,
            status,
          }) as MeetingGateSuggestionWire
        }
      />
    </ThemeProvider>,
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Ask AI for a suggestion" }),
  );
  expect(
    screen.getByText(new RegExp(copy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))),
  ).toBeTruthy();
  expect(screen.queryByText(/^Suggestion:/)).toBeNull();
  expect(screen.getByText(/The rules result still applies\./)).toBeTruthy();
});
it("keeps the rules message after a failed request and blocks taps while busy", async () => {
  const onRequest = jest.fn(async () => {
    throw new Error("unavailable");
  });
  const tree = await render(
    <ThemeProvider>
      <MeetingGateSuggestion busy={true} onRequest={onRequest} />
    </ThemeProvider>,
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Ask AI for a suggestion" }),
  );
  expect(onRequest).not.toHaveBeenCalled();
  await tree.rerender(
    <ThemeProvider>
      <MeetingGateSuggestion busy={false} onRequest={onRequest} />
    </ThemeProvider>,
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Ask AI for a suggestion" }),
  );
  expect(
    screen.getByText(
      "An AI suggestion is unavailable. The rules result still applies.",
    ),
  ).toBeTruthy();
});
