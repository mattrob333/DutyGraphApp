import React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { ThemeProvider } from "@/theme";
import type { EarnRepository } from "@/api/earn";
import type {
  DraftChecks,
  EarnSummary,
  TaskCardDraft,
  TaskCardDraftInput,
  TeamBoard,
} from "@/api/earn/types";
import {
  EarnDraftScreen,
  EarnDraftsScreen,
  EarnEntry,
  EarnGapsScreen,
  EarnRulesScreen,
  EarnScoreboardScreen,
  TeamRows,
} from "../Screens";
import { EarnTaskCardView } from "../TaskCardView";
import { paidCardCount, parseHours, slotMissing, teamRows } from "../logic";
type MockView = import("react-native").View;
type MockPressableProps = import("react-native").PressableProps;
type MockViewProps = import("react-native").ViewProps;
type MockCardProps = import("@/components/common/Card").CardProps;
type MockCardModule = typeof import("@/components/common/Card");
type MockNative = typeof import("react-native");
type MockReact = typeof import("react");
let mockCheckboxProps: MockPressableProps[] = [];
let mockCompositeChildren: {
  kind: "View" | "Card";
  children: React.ReactNode;
}[] = [];
// RNTL 14 exposes only host nodes. Keep native Pressable behavior while
// observing the explicit ARIA input before native consumes it.
jest.mock("react-native", () => {
  const react = jest.requireActual<MockReact>("react");
  const native = jest.requireActual<MockNative>("react-native");
  const NativePressable = native.Pressable;
  const NativeView = native.View;
  const ViewProbe = react.forwardRef<MockView, MockViewProps>((props, ref) => {
    mockCompositeChildren.push({ kind: "View", children: props.children });
    return react.createElement(NativeView, { ...props, ref });
  });
  Object.defineProperty(native, "View", {
    configurable: true,
    enumerable: true,
    get: () => ViewProbe,
  });
  const Probe = react.forwardRef<MockView, MockPressableProps>((props, ref) => {
    if (props.accessibilityLabel === "Step 1: Park in the marked bay.")
      mockCheckboxProps.push(props);
    return react.createElement(NativePressable, { ...props, ref });
  });
  Object.defineProperty(native, "Pressable", {
    configurable: true,
    enumerable: true,
    get: () => Probe,
  });
  return native;
});
jest.mock("@/components/common/Card", () => {
  const react = jest.requireActual<MockReact>("react");
  const actual = jest.requireActual<MockCardModule>("@/components/common/Card");
  return {
    ...actual,
    Card: (props: MockCardProps) => {
      mockCompositeChildren.push({ kind: "Card", children: props.children });
      return react.createElement(actual.Card, props);
    },
  };
});
let mockRepository: EarnRepository;
let mockKey = 0;
jest.mock("@/api/earn", () => ({ useEarnRepository: () => mockRepository }));
jest.mock("@/hooks/queries", () => ({
  useMe: () => ({ data: { displayName: "Dana Reed" } }),
}));
jest.mock("expo-haptics", () => ({
  impactAsync: async () => {},
  ImpactFeedbackStyle: { Light: "light" },
}));
jest.mock("expo-crypto", () => ({
  randomUUID: () => `fictional-command-${++mockKey}`,
}));
jest.mock("expo-clipboard", () => ({
  setStringAsync: jest.fn(async () => true),
}));
jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => false,
  },
  useFocusEffect: (fn: () => void) => require("react").useEffect(fn, [fn]),
}));
jest.mock("../VoiceField", () => ({
  VoiceField: ({
    value,
    onChange,
    label,
  }: {
    value: string;
    onChange: (v: string) => void;
    label: string;
  }) => {
    const { TextInput } = require("react-native");
    return (
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
      />
    );
  },
}));
const slots: TaskCardDraftInput["slots"] = {
  startsWhen: { value: "A van returns.", basis: "stated" },
  getsFrom: { value: "The parts checklist.", basis: "stated" },
  does: { value: "Count and refill the bins.", basis: "told_me" },
  handsTo: { value: "Tell the dispatch lead.", basis: "told_me" },
  howOften: { value: "Each day", basis: "stated" },
  howLong: { value: "20 minutes", basis: "stated" },
  onlyIKnow: { value: null, basis: "not_stated" },
};
const card: TaskCardDraftInput = {
  title: "Restock the service van",
  duty: "Keep the van ready",
  kind: "today",
  workType: "manual",
  slots,
  steps: [
    {
      do: "Park in the marked bay.",
      where: "Service bay 2",
      tool: { name: "Parts checklist", getFrom: "Dispatch tray" },
      materials: [{ name: "Seal kits", getFrom: "Shelf B3" }],
      minutes: 2,
      watchFor: "Keep the fire exit clear.",
      safety: "Switch off the engine.",
    },
    "Count the parts.",
    "Refill the empty bins.",
  ],
  doneMeans: "Every bin is full.",
  safety: ["Use the company lifting procedure."],
  whereThingsAre: [
    { item: "Red tags", place: "Top drawer of the red cabinet" },
  ],
  aiIAlreadyUse: "<script>do not run this</script>",
};
const checks: DraftChecks = {
  filledSlots: 6,
  emptySlots: ["onlyIKnow"],
  stepCount: 3,
  hasDoneMeans: true,
  hasNamedHandoff: true,
  readyToHandOff: true,
  secretsRemoved: 0,
  generic: { flagged: false },
  possibleDuplicates: [],
  earnHint: "likely",
  earnHintReasons: [],
};
const draft: TaskCardDraft = {
  id: "own-draft",
  version: 1,
  via: "mcp",
  state: "waiting",
  sourceNote: "past_chats",
  card,
  checks,
  createdAt: "2026-10-28T12:00:00Z",
  expiresAt: "2099-01-01T00:00:00Z",
  stateChangedAt: "2026-10-28T12:00:00Z",
};
const board: TeamBoard = {
  scope: "pod",
  teamTotalCards: 6,
  rows: [
    {
      personId: "z",
      name: "Zoe Ellis",
      role: "Technician",
      confirmedCards: 4,
      fixes: 1,
    },
    {
      personId: "d",
      name: "Dana Reed",
      role: "Coordinator",
      confirmedCards: 2,
      fixes: 0,
    },
  ],
};
const summary: EarnSummary = {
  settings: {
    enabled: true,
    perCardCents: 10000,
    maxPaidCardsPerPerson: null,
    engagementFeeCents: 3000000,
    poolCents: 2000000,
    dutygraphKeepsCents: 1000000,
    poolCommittedCents: 20000,
    poolLeftCents: 1980000,
    bonusRateBp: 1000,
    loadedHourlyRateCents: 6000,
    weeksPerYear: 48,
    bonusCapCents: 500000,
    checkDays: 30,
    payRulesNote: "Your company's pay rules apply.",
    showTitlesToPeers: false,
    payoutMode: "payroll_csv",
    poolFunding: { state: "not_invoiced" },
  },
  me: {
    paidCards: 2,
    maxPaidCards: null,
    earnedPaidCents: 20000,
    earnedWaitingCents: 10000,
    hoursSavedPerWeek: 15,
    confirmedCards: 2,
    draftsWaiting: 1,
  },
  claims: [],
  fixes: [],
};
function baseRepository(): EarnRepository {
  return {
    getSummary: async () => structuredClone(summary),
    listDrafts: async (state) => ({
      drafts: state === "confirmed" ? [] : [structuredClone(draft)],
      counts: { waiting: 1, confirmed: 0, not_mine: 0, expired: 0 },
    }),
    getDraft: async () => structuredClone(draft),
    confirmDraft: async () => ({
      draft: { ...structuredClone(draft), state: "confirmed" },
      taskRecordId: "created-task",
    }),
    notMine: async () => ({ ...structuredClone(draft), state: "not_mine" }),
    getTeamBoard: async () => structuredClone(board),
    getGaps: async () => ({ gaps: [] }),
    createFix: async () => {
      throw new Error("unused");
    },
    supportsDraftCreation: async () => false,
    createDraftFromTask: async () => ({ drafts: [], refused: [] }),
  };
}
const show = (component: React.ReactElement) =>
  render(<ThemeProvider>{component}</ThemeProvider>);
beforeEach(() => {
  mockCheckboxProps = [];
  mockCompositeChildren = [];
  mockKey = 0;
  mockRepository = baseRepository();
});
function assertNoRawViewText(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(assertNoRawViewText);
    return;
  }
  if (!value || typeof value !== "object") return;
  const node = value as { type?: unknown; children?: unknown };
  if (!Array.isArray(node.children)) return;
  if (node.type === "View" || node.type === "RCTView") {
    expect(
      node.children.filter(
        (child) => typeof child === "string" || typeof child === "number",
      ),
    ).toEqual([]);
  }
  node.children.forEach(assertNoRawViewText);
}

function assertNoRawCompositeChildren(
  records: typeof mockCompositeChildren,
): void {
  for (const record of records) {
    const raw: (string | number)[] = [];
    const visit = (child: React.ReactNode): void => {
      if (Array.isArray(child)) {
        child.forEach(visit);
        return;
      }
      if (typeof child === "string" || typeof child === "number") {
        raw.push(child);
        return;
      }
      if (
        React.isValidElement<{ children?: React.ReactNode }>(child) &&
        child.type === React.Fragment
      )
        visit(child.props.children);
    };
    visit(record.children);
    expect({ kind: record.kind, raw }).toEqual({ kind: record.kind, raw: [] });
  }
}

describe("Earn phone core screens", () => {
  it("shows hands-on detail and local ticks without evaluating card text", async () => {
    await show(
      <EarnTaskCardView card={card} checks={checks} name="Dana Reed" />,
    );
    expect(screen.getByText("Place: Service bay 2")).toBeTruthy();
    expect(
      screen.getByText("Tool: Parts checklist · Get it from: Dispatch tray"),
    ).toBeTruthy();
    expect(
      screen.getByText("Material: Seal kits · Get it from: Shelf B3"),
    ).toBeTruthy();
    expect(screen.getByText("Safety: Switch off the engine.")).toBeTruthy();
    expect(screen.getByText("<script>do not run this</script>")).toBeTruthy();
    const tick = screen.getByRole("checkbox", {
      name: "Step 1: Park in the marked bay.",
    });
    expect(tick.props.accessibilityState.checked).toBe(false);
    // Forward through the real native Pressable while observing the explicit
    // web ARIA input. Native consumes that input into accessibilityState.
    expect(mockCheckboxProps.at(-1)?.["aria-checked"]).toBe(false);
    await fireEvent.press(tick);
    expect(
      screen.getByRole("checkbox", { name: "Step 1: Park in the marked bay." })
        .props.accessibilityState.checked,
    ).toBe(true);
    expect(mockCheckboxProps.at(-1)?.["aria-checked"]).toBe(true);
    expect(screen.getByText("Not stated")).toBeTruthy();
  });
  it("treats guessed slot values as unknown and preserves uncapped counts", () => {
    const guessed = structuredClone(card);
    guessed.slots.onlyIKnow = { value: "a guess", basis: "not_stated" };
    expect(slotMissing(guessed, "onlyIKnow")).toBe(true);
    expect(paidCardCount(3, null)).toBe("Paid cards: 3");
    expect(paidCardCount(3, 5)).toBe("Paid cards: 3 of 5");
    expect(parseHours("200.5")).toBe(200.5);
    expect(() => parseHours("1.22")).toThrow();
    expect(() => parseHours("-1")).toThrow();
  });
  it("sorts team by name with counts, never peer card text or rank", async () => {
    expect(teamRows(board).map((row) => row.name)).toEqual([
      "Dana Reed",
      "Zoe Ellis",
    ]);
    await show(<TeamRows board={board} />);
    expect(screen.getByText("Team total: 6 Task Cards written")).toBeTruthy();
    expect(screen.queryByText(/Restock/)).toBeNull();
    expect(screen.queryByText(/rank|medal/i)).toBeNull();
  });
  it("hides financial entries and direct financial data when Earn is off", async () => {
    mockRepository.getSummary = async () => ({
      ...structuredClone(summary),
      settings: { ...summary.settings, enabled: false },
    });
    await show(<EarnEntry />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "From your AI" })).toBeTruthy(),
    );
    expect(screen.queryByRole("button", { name: "Scoreboard" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Earn" })).toBeNull();
    await show(<EarnScoreboardScreen repository={mockRepository} />);
    await waitFor(() =>
      expect(
        screen.getByText("Earn is not turned on for this company."),
      ).toBeTruthy(),
    );
    expect(screen.queryByText("$200")).toBeNull();
    expect(screen.queryByText("$100")).toBeNull();
  });
  it("pairs each scoreboard amount with pay rules and hides advisor fee/share", async () => {
    await show(<EarnScoreboardScreen repository={mockRepository} />);
    await waitFor(() => expect(screen.getByText("$200")).toBeTruthy());
    expect(screen.getByText("$100")).toBeTruthy();
    expect(screen.getAllByText("Your company's pay rules apply.")).toHaveLength(
      2,
    );
    expect(screen.queryByText("$30,000")).toBeNull();
    expect(screen.queryByText("$10,000")).toBeNull();
  });
  it("does not label a failed confirmed-card list as empty and can retry it", async () => {
    let failed = true;
    mockRepository.listDrafts = async (state) => {
      if (state === "confirmed" && failed)
        throw new Error("Confirmed connection failed.");
      return {
        drafts: state === "confirmed" ? [] : [draft],
        counts: { waiting: 1, confirmed: 0, not_mine: 0, expired: 0 },
      };
    };
    await show(<EarnDraftsScreen repository={mockRepository} />);
    await waitFor(() =>
      expect(screen.getByText("Confirmed connection failed.")).toBeTruthy(),
    );
    expect(screen.queryByText("No cards confirmed here yet.")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Restock the service van" }),
    ).toBeTruthy();
    failed = false;
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() =>
      expect(screen.getByText("No cards confirmed here yet.")).toBeTruthy(),
    );
  });
  it("waits for confirmation acknowledgement, pins version and retains retry key on a network failure", async () => {
    const calls: { id: string; version: number; key: string }[] = [];
    let fail = true;
    mockRepository.confirmDraft = async (id, version, key) => {
      calls.push({ id, version, key });
      if (fail) throw new Error("Temporary network failure.");
      return {
        draft: { ...draft, state: "confirmed" },
        taskRecordId: "created-task",
      };
    };
    await show(<EarnDraftScreen id={draft.id} repository={mockRepository} />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Confirm" })).toBeTruthy(),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() =>
      expect(screen.getByText("Temporary network failure.")).toBeTruthy(),
    );
    expect(screen.queryByText("Draft state: confirmed")).toBeNull();
    fail = false;
    await fireEvent.press(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() =>
      expect(screen.getByText("Draft state: confirmed")).toBeTruthy(),
    );
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual(calls[1]);
    expect(calls[0].version).toBe(1);
    expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();
  });
  it("locks stale draft actions until a successful fresh reload", async () => {
    mockRepository.confirmDraft = async () => {
      throw Object.assign(new Error("stale"), { code: "VERSION_CONFLICT" });
    };
    let current = draft;
    mockRepository.getDraft = async () => structuredClone(current);
    await show(<EarnDraftScreen id={draft.id} repository={mockRepository} />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Confirm" })).toBeTruthy(),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() =>
      expect(
        screen.getByText("This card changed. Reload it before trying again."),
      ).toBeTruthy(),
    );
    expect(
      screen.getByRole("button", { name: "Confirm" }).props.accessibilityState
        .disabled,
    ).toBe(true);
    current = { ...draft, version: 2 };
    await fireEvent.press(
      screen.getByRole("button", { name: "Reload changed card" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Confirm" }).props.accessibilityState
          .disabled,
      ).toBe(false),
    );
  });
  it("labels local devserver money data and does not falsely report failed clipboard copying", async () => {
    mockRepository.supportsDraftCreation = async () => true;
    const clipboard = require("expo-clipboard");
    clipboard.setStringAsync.mockResolvedValue(false);
    await show(<EarnRulesScreen repository={mockRepository} />);
    await waitFor(() =>
      expect(
        screen.getByText("Local development data. No real money moves."),
      ).toBeTruthy(),
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Copy Find tasks only I know" }),
    );
    await waitFor(() =>
      expect(
        screen.getByText("Copy did not work. Use Share instead."),
      ).toBeTruthy(),
    );
    expect(screen.queryByText("Copied.")).toBeNull();
  });
  it("keeps missing-slot edits local and sends the reviewed card only with Confirm", async () => {
    const submitted: TaskCardDraftInput[] = [];
    mockRepository.confirmDraft = async (_id, _version, _key, reviewed) => {
      submitted.push(reviewed!);
      return {
        draft: { ...draft, card: reviewed!, state: "confirmed" },
        taskRecordId: "created-task",
      };
    };
    await show(<EarnDraftScreen id={draft.id} repository={mockRepository} />);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Add Only I know" }),
      ).toBeTruthy(),
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Add Only I know" }),
    );
    await fireEvent.changeText(
      screen.getByLabelText("Only I know detail"),
      "The spare tags are behind the blue bins.",
    );
    expect(submitted).toHaveLength(0);
    expect(screen.getByText("Draft state: waiting")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() =>
      expect(screen.getByText("Draft state: confirmed")).toBeTruthy(),
    );
    expect(submitted[0].slots.onlyIKnow).toEqual({
      value: "The spare tags are behind the blue bins.",
      basis: "told_me",
    });
  });
  it("submits a gap fix through the repository with no identity fields", async () => {
    const requests: unknown[] = [];
    mockRepository.getGaps = async () => ({
      gaps: [
        {
          id: "gap-1",
          kind: "bottleneck",
          department: "Stores",
          stage: "Check",
          title: "Returns wait for a check",
          whatHappens: "Parts wait in the tray.",
          measure: { name: "Returns checked a day", today: "12" },
          peopleWorkingOnIt: 0,
          myFixIds: [],
        },
      ],
    });
    mockRepository.createFix = async (input) => {
      requests.push(input);
      return {
        fix: {
          id: "own-fix",
          gapId: input.gapId ?? null,
          text: input.text,
          kind: input.kind,
          measureName: input.measureName,
          hoursBefore: input.hoursBefore,
          hoursAfter: input.hoursAfter,
          state: "sent",
          createdAt: "2026-10-28T12:00:00Z",
        },
      };
    };
    await show(<EarnGapsScreen repository={mockRepository} />);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Returns wait for a check" }),
      ).toBeTruthy(),
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Returns wait for a check" }),
    );
    await fireEvent.press(screen.getByRole("button", { name: "I have a fix" }));
    await fireEvent.changeText(
      screen.getByLabelText("What would you change?"),
      "Check the tray before dispatch.",
    );
    await fireEvent.changeText(
      screen.getByLabelText("Hours a week before"),
      "20",
    );
    await fireEvent.changeText(
      screen.getByLabelText("Hours a week after (proposed)"),
      "5",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Send fix" }));
    await waitFor(() =>
      expect(
        screen.getByText("Fix sent. Your manager can review it."),
      ).toBeTruthy(),
    );
    expect(requests).toEqual([
      {
        gapId: "gap-1",
        text: "Check the tray before dispatch.",
        kind: "new_steps",
        measureName: "Returns checked a day",
        measureBefore: "12",
        hoursBefore: 20,
        hoursAfter: 5,
      },
    ]);
  });
  it("renders a full scoreboard fix row without raw text under host Views", async () => {
    mockRepository.getSummary = async () => ({
      ...structuredClone(summary),
      fixes: [
        {
          id: "checked-fix",
          gapId: null,
          text: "Check the tray before dispatch.",
          kind: "new_steps",
          measureName: "Returns checked a day",
          hoursBefore: 20,
          hoursAfter: 5,
          hoursAfterChecked: 5,
          state: "paid",
          bonusCents: 432000,
          checkDueAt: "2026-10-01T00:00:00Z",
          createdAt: "2026-09-01T00:00:00Z",
        },
      ],
    });
    const rendered = await show(
      <EarnScoreboardScreen repository={mockRepository} />,
    );
    await waitFor(() =>
      expect(screen.getByText("Check the tray before dispatch.")).toBeTruthy(),
    );
    expect(screen.getByText("$4,320")).toBeTruthy();
    assertNoRawViewText(rendered.toJSON());
  });
  it("keeps empty optional strings out of open gap forms and card composite children", async () => {
    mockRepository.getGaps = async () => ({
      gaps: [
        {
          id: "gap-raw",
          kind: "bottleneck",
          department: "Stores",
          stage: "Check",
          title: "Returns wait for a check",
          whatHappens: "Parts wait.",
          measure: { name: "Returns checked a day", today: "12" },
          peopleWorkingOnIt: 0,
          myFixIds: [],
        },
      ],
    });
    await show(<EarnGapsScreen repository={mockRepository} />);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Returns wait for a check" }),
      ).toBeTruthy(),
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Returns wait for a check" }),
    );
    await fireEvent.press(screen.getByRole("button", { name: "I have a fix" }));
    expect(screen.getByLabelText("What would you change?")).toBeTruthy();
    // Unlike toJSON, these forwarded composite props retain empty strings.
    expect(mockCompositeChildren.some((record) => record.kind === "Card")).toBe(
      true,
    );
    assertNoRawCompositeChildren(mockCompositeChildren);
    const empty = structuredClone(card);
    empty.approvalsAndRules = "";
    empty.aiIAlreadyUse = "";
    empty.money = {
      kind: "purchase",
      system: "",
      typicalAmount: "",
      limit: "",
      approver: "",
    };
    empty.steps = [
      {
        do: "Check the tray.",
        where: "",
        watchFor: "",
        safety: "",
        tool: { name: "Checklist", getFrom: "" },
        materials: [{ name: "Tags", getFrom: "" }],
      },
    ];
    mockCompositeChildren = [];
    await show(<EarnTaskCardView card={empty} checks={checks} />);
    assertNoRawCompositeChildren(mockCompositeChildren);
    // Negative control proves that a renderer-dropped empty string fails.
    expect(() =>
      assertNoRawCompositeChildren([
        {
          kind: "Card",
          children: [
            "",
            <React.Fragment key="valid">
              <></>
            </React.Fragment>,
          ],
        },
      ]),
    ).toThrow();
  });
});
