import { describe, it, expect, jest } from "@jest/globals";
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { ThemeProvider } from "@/theme";
import type { EarnRepository } from "@/api/earn";
import type { Claim, TaskCardDraft } from "@/api/earn/types";
import { cardStatus, galleryCards, sameTitle, withAiRows } from "../gallery-logic";
import { EarnDraftsScreen } from "../Screens";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), replace: jest.fn(), back: jest.fn(), canGoBack: () => false },
  useFocusEffect: (fn: () => void) => require("react").useEffect(fn, [fn]),
}));
jest.mock("@/api/earn", () => ({ useEarnRepository: () => null }));

const slot = (value: string | null) => ({ value, basis: value ? "told_me" : "not_stated" }) as const;
function draft(id: string, title: string, workType: "manual" | "digital" | "mixed", state: "waiting" | "confirmed", createdAt: string): TaskCardDraft {
  return {
    id, version: 1, via: "mcp", state, sourceNote: "past_chats",
    card: {
      title, duty: "Keep pumps safe", kind: "today", workType,
      slots: { startsWhen: slot("Monday"), getsFrom: slot("SAP"), does: slot("Check"), handsTo: slot("Dana"), howOften: slot("Weekly"), howLong: slot("1 h"), onlyIKnow: slot(null) },
      steps: ["One", "Two", "Three"], doneMeans: "Done",
    },
    checks: { filledSlots: 6, emptySlots: ["onlyIKnow"], stepCount: 3, hasDoneMeans: true, hasNamedHandoff: true, readyToHandOff: true, secretsRemoved: 0, generic: { flagged: false }, possibleDuplicates: [] },
    createdAt, expiresAt: "2099-01-01T00:00:00Z", stateChangedAt: createdAt,
  } as unknown as TaskCardDraft;
}
const now = Date.parse("2026-10-29T12:00:00Z");

describe("Task Card gallery rules (shared with the web)", () => {
  it("labels New for 15 minutes, then Check it, and confirmed cards by claim", () => {
    expect(cardStatus(draft("a", "A", "manual", "waiting", "2026-10-29T11:50:00Z"), undefined, now)).toEqual({ label: "New", kind: "new" });
    expect(cardStatus(draft("a", "A", "manual", "waiting", "2026-10-29T11:40:00Z"), undefined, now)).toEqual({ label: "Check it", kind: "check" });
    expect(cardStatus(draft("a", "A", "manual", "confirmed", "2026-10-29T11:00:00Z"), undefined, now).label).toBe("Confirmed");
    const paid = { state: "paid", amountCents: 10000 } as Claim;
    expect(cardStatus(draft("a", "A", "manual", "confirmed", "2026-10-29T11:00:00Z"), paid, now).label).toBe("Earned $100");
  });
  it("puts waiting cards first, newest first", () => {
    const list = galleryCards(
      [draft("w1", "W1", "manual", "waiting", "2026-10-29T10:00:00Z"), draft("w2", "W2", "manual", "waiting", "2026-10-29T11:00:00Z")],
      [draft("c1", "C1", "digital", "confirmed", "2026-10-29T11:30:00Z")],
    );
    expect(list.map((d) => d.id)).toEqual(["w2", "w1", "c1"]);
  });
  it("shows one row per task and drops a task once a card has the same title", () => {
    const rows = withAiRows(
      { discoveries: [{ discoveryId: "d", synthetic: false, updatedAt: "", candidates: [
        { candidateId: "1", title: "Approve freight invoices", state: "asking", answers: 3, requiredDone: 6, requiredOf: 10, readyForReview: false },
        { candidateId: "2", title: "Count the cage stock!", state: "asking", answers: 9, requiredDone: 10, requiredOf: 10, readyForReview: true },
        { candidateId: "3", title: "approve freight invoices", state: "asking", answers: 1, requiredDone: 2, requiredOf: 10, readyForReview: false },
      ] }] },
      [draft("c", "Count the cage stock", "manual", "waiting", "2026-10-29T11:00:00Z")],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ title: "Approve freight invoices", stage: "asking", pill: "Your AI is asking", line: "3 answers so far", done: 6 });
    expect(sameTitle("Count the cage stock!")).toBe(sameTitle("count the CAGE stock"));
  });
});

describe("My work on the phone", () => {
  function repo(connected: { app: string; lastUsedAt: string }[]): EarnRepository {
    const recent = new Date(Date.now() - 60_000).toISOString();
    return {
      getSummary: async () => ({ settings: { enabled: true }, me: {}, claims: [], fixes: [] }) as never,
      listDrafts: async (state) => ({
        drafts: state === "waiting"
          ? [draft("n", "Resolve overdue supplier orders", "mixed", "waiting", recent)]
          : [draft("m", "Count branch stock in the cage", "manual", "confirmed", "2026-10-20T10:00:00Z"), draft("d", "Match supplier credit memos", "digital", "confirmed", "2026-10-21T10:00:00Z")],
        counts: { waiting: 1, confirmed: 2, not_mine: 0, expired: 0 },
      }),
      listDiscoveries: async () => ({ discoveries: [{ discoveryId: "d1", synthetic: false, updatedAt: "", candidates: [{ candidateId: "c1", title: "Approve weekly freight invoices", state: "asking", answers: 2, requiredDone: 6, requiredOf: 10, readyForReview: false }] }], connected }),
      getDraft: async () => { throw new Error("unused"); },
      confirmDraft: async () => { throw new Error("unused"); },
      notMine: async () => { throw new Error("unused"); },
      getTeamBoard: async () => { throw new Error("unused"); },
      getGaps: async () => ({ gaps: [] }),
      createFix: async () => { throw new Error("unused"); },
      supportsDraftCreation: async () => false,
      createDraftFromTask: async () => ({ drafts: [], refused: [] }),
    };
  }
  it("shows the AI row, one gallery with type filters, and the Connected line", async () => {
    await render(<ThemeProvider><EarnDraftsScreen repository={repo([{ app: "ChatGPT", lastUsedAt: "2026-10-29T11:00:00Z" }])} /></ThemeProvider>);
    expect(await screen.findByLabelText(/^Approve weekly freight invoices\. 2 answers so far\. Your AI is asking/)).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("button", { name: "Resolve overdue supplier orders, Mixed, New" })).toBeTruthy());
    expect(screen.getByRole("button", { name: "Count branch stock in the cage, Manual, Confirmed" })).toBeTruthy();
    expect(screen.getByText(/Connected to ChatGPT/)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Manual, 1" }));
    expect(screen.queryByRole("button", { name: /^Match supplier credit memos/ })).toBeNull();
    expect(screen.getByRole("button", { name: /^Count branch stock in the cage/ })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: /^Count branch stock in the cage/ }));
    expect(mockPush).toHaveBeenCalledWith("/earn/drafts/m");
  });
  it("offers Connect your AI until an AI app is connected", async () => {
    await render(<ThemeProvider><EarnDraftsScreen repository={repo([])} /></ThemeProvider>);
    expect(await screen.findByRole("button", { name: /^Connect your AI/ })).toBeTruthy();
    expect(screen.queryByText(/Connected to/)).toBeNull();
  });
});
