import React from "react";
import { render, screen } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import { ThemeProvider } from "@/theme";
import type { DraftChecks, TaskCardDraftInput } from "@/api/earn/types";
import { EarnTaskCardView } from "../TaskCardView";

jest.mock("expo-haptics", () => ({
  impactAsync: async () => {},
  ImpactFeedbackStyle: { Light: "light" },
}));

// Constructed server responses only. These cases test presentation, not local
// similarity scoring, generic detection or approval/payment authorization.
const card: TaskCardDraftInput = {
  title: "Review this work",
  duty: "Keep service vans ready",
  kind: "today",
  workType: "manual",
  slots: {
    startsWhen: { value: "The van returns", basis: "stated" },
    getsFrom: { value: "Driver checklist", basis: "stated" },
    does: { value: "Refill used parts", basis: "stated" },
    handsTo: { value: "Dispatch lead", basis: "stated" },
    howOften: { value: "Daily", basis: "stated" },
    howLong: { value: "25 minutes", basis: "stated" },
    onlyIKnow: { value: "Spare tags in stores", basis: "stated" },
  },
  steps: ["Read the checklist", "Count used parts", "Refill the bins"],
  doneMeans: "Dispatch has the signed checklist",
};

function checks(reason: "too_generic" | "already_mapped"): DraftChecks {
  return {
    filledSlots: 7,
    emptySlots: [],
    stepCount: 3,
    hasDoneMeans: true,
    hasNamedHandoff: true,
    readyToHandOff: true,
    secretsRemoved: 0,
    generic: { flagged: reason === "too_generic" },
    possibleDuplicates:
      reason === "already_mapped"
        ? [{
            kind: "card",
            id: "11111111-1111-4111-8111-111111111111",
            title: "Restock the service van",
            ownerName: "Dana Cole",
            score: 0.9,
          }]
        : [],
    earnHint: "not_yet",
    earnHintReasons: [reason],
  };
}

describe("server-authored fairness warnings", () => {
  it("shows the generic warning even when the card is complete", async () => {
    await render(
      <ThemeProvider>
        <EarnTaskCardView card={{ ...card, title: "Attend meetings" }} checks={checks("too_generic")} />
      </ThemeProvider>,
    );
    expect(screen.getByText("Ready to hand off")).toBeTruthy();
    expect(screen.getByText(/Will not earn yet/)).toBeTruthy();
    expect(screen.getByText(/^Too generic: everyone writes emails/)).toBeTruthy();
    expect(screen.queryByText(/Likely to earn/)).toBeNull();
  });

  it.each(["Restock service van bins", "Refill the van seal-kit bin"])(
    "shows the duplicate candidate for the review example %s",
    async (title) => {
      await render(
        <ThemeProvider>
          <EarnTaskCardView card={{ ...card, title }} checks={checks("already_mapped")} />
        </ThemeProvider>,
      );
      expect(screen.getByText(/Will not earn yet/)).toBeTruthy();
      expect(screen.getByText("This may already be mapped. Review the possible duplicates.")).toBeTruthy();
      expect(screen.getByText("Looks like Dana Cole's card 'Restock the service van'")).toBeTruthy();
      expect(screen.queryByText(/Likely to earn/)).toBeNull();
    },
  );
});
