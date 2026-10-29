/** Fictional local-development data. This file is never imported by the phone app. */
import type {
  TaskCardDraftInput,
  TaskCardDraft,
  DraftChecks,
  EarnSummary,
  Gap,
  Fix,
  Claim,
  TeamBoard,
} from "../../mobile/src/api/earn/types.ts";
import { hash, type Principal } from "./core.ts";
export const earnSlots = [
  "startsWhen",
  "getsFrom",
  "does",
  "handsTo",
  "howOften",
  "howLong",
  "onlyIKnow",
] as const;
export function earnId(
  p: Pick<Principal, "companyId" | "personId">,
  kind: string,
  index: number,
) {
  const h = hash([p.companyId, p.personId, "earn", kind, index]);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
export function manualEarnCard(): TaskCardDraftInput {
  return {
    title: "Restock the service van",
    duty: "Keep the service team ready",
    kind: "today",
    workType: "manual",
    slots: {
      startsWhen: {
        value: "The van returns from its last call.",
        basis: "stated",
      },
      getsFrom: {
        value: "The driver leaves the parts checklist in the dispatch tray.",
        basis: "stated",
      },
      does: {
        value: "Check used parts. Refill each marked bin.",
        basis: "told_me",
      },
      handsTo: { value: "Tell dispatch the van is ready.", basis: "stated" },
      howOften: { value: "Each weekday", basis: "stated" },
      howLong: { value: "25 minutes", basis: "told_me" },
      onlyIKnow: {
        value: "The spare red tags are behind the blue parts bins.",
        basis: "told_me",
      },
    },
    steps: [
      {
        do: "Park the van in the marked bay.",
        where: "Service bay 2, rear yard",
        minutes: 2,
        watchFor: "Keep the fire exit clear.",
        safety: "Switch off the engine and apply the parking brake.",
      },
      {
        do: "Count the parts marked on the checklist.",
        where: "Rear van shelves",
        tool: {
          name: "Parts checklist",
          getFrom: "Dispatch tray beside the office door",
        },
        minutes: 8,
        safety: "Use the fixed step. Do not climb on the shelving.",
      },
      {
        do: "Refill the empty bins.",
        where: "Stores room, aisle B",
        tool: { name: "Parts trolley", getFrom: "Inside the stores door" },
        materials: [
          { name: "Seal kits", getFrom: "Shelf B3" },
          { name: "Red tags", getFrom: "Top drawer of the red cabinet" },
        ],
        minutes: 15,
        watchFor: "Match each part number before loading.",
        safety: "Follow the company lifting procedure.",
      },
    ],
    doneMeans: "All checklist bins are full and the dispatch list is signed.",
    tools: ["Parts trolley", "Parts checklist"],
    safety: [
      "Follow the company lifting procedure. This card does not replace it.",
    ],
    whereThingsAre: [
      { item: "Parts trolley", place: "Inside the stores door" },
      { item: "Red tags", place: "Top drawer of the red cabinet" },
    ],
    aiIAlreadyUse: "No AI is used to refill the van.",
    links: {
      companyPurpose: "Keep customer equipment running",
      departmentGoal: "Send service vans ready for each call",
      role: "Service coordinator",
      myDuty: "Keep the service team ready",
    },
    impact: {
      measure: "Vans ready at start of shift",
      how: "Replace used parts before the next shift.",
    },
  };
}
export function earnChecks(
  card: TaskCardDraftInput,
  enabled = true,
): DraftChecks {
  const emptySlots = earnSlots.filter(
    (key) =>
      card.slots[key].basis === "not_stated" || !card.slots[key].value?.trim(),
  );
  const ready =
    emptySlots.length <= 2 &&
    card.steps.length >= 3 &&
    !!card.doneMeans?.trim() &&
    !!card.slots.handsTo.value?.trim();
  // Deliberately narrow local examples, not the production generic-work policy.
  const generic = /^(?:(answer|check|read)( my)? (emails|messages)|attend meetings|submit timesheets)$/i.test(
    card.title.trim(),
  );
  const reasons: DraftChecks["earnHintReasons"] = [];
  if (!ready) reasons.push("not_ready");
  if (!card.links?.role || !card.links.myDuty) reasons.push("not_linked");
  if (generic) reasons.push("too_generic");
  return {
    filledSlots: 7 - emptySlots.length,
    emptySlots,
    stepCount: card.steps.length,
    hasDoneMeans: !!card.doneMeans,
    hasNamedHandoff: !!card.slots.handsTo.value,
    readyToHandOff: ready,
    secretsRemoved: 0,
    generic: { flagged: generic },
    possibleDuplicates: [],
    earnHint: !enabled ? "off" : reasons.length ? "not_yet" : "likely",
    earnHintReasons: enabled ? reasons : [],
  };
}
/**
 * Opt-in deterministic warning examples for development/tests only.
 * Candidate scores and ownership below are authored fixture values. They do not
 * detect similarity, enforce uniqueness, decide split-task eligibility or approve
 * money. Default seeds stay unchanged; production checks belong to the server.
 */
export function earnFairnessScenarios(): {
  kind: "generic" | "duplicate" | "split";
  card: TaskCardDraftInput;
  checks: DraftChecks;
}[] {
  return (["generic", "duplicate", "split"] as const).map((kind) => {
    const card = manualEarnCard();
    card.title =
      kind === "generic"
        ? "Attend meetings"
        : kind === "duplicate"
          ? "Restock service van bins"
          : "Refill the van seal-kit bin";
    const checks = earnChecks(card);
    if (kind !== "generic") {
      checks.possibleDuplicates = [{
        kind: "card",
        id: "11111111-1111-4111-8111-111111111111",
        title: "Restock the service van",
        ownerName: "Dana Cole",
        score: kind === "duplicate" ? 0.9 : 0.7,
      }];
      checks.earnHint = "not_yet";
      checks.earnHintReasons = ["already_mapped"];
    }
    return { kind, card, checks };
  });
}
export function earnSeed(p: Principal, enabled = true) {
  const now = new Date().toISOString(),
    future = new Date(Date.now() + 30 * 86400000).toISOString();
  const card = manualEarnCard(),
    incomplete = structuredClone(card);
  incomplete.title = "Check the stock return";
  incomplete.slots.onlyIKnow = { value: null, basis: "not_stated" };
  incomplete.slots.handsTo = { value: null, basis: "not_stated" };
  incomplete.steps = ["Inspect the returns tray."];
  const drafts: TaskCardDraft[] = [card, incomplete].map((value, i) => ({
    id: earnId(p, "draft", i),
    version: 1,
    via: i ? "upload" : "mcp",
    state: "waiting",
    sourceNote: i ? "file" : "past_chats",
    card: value,
    checks: earnChecks(value, enabled),
    createdAt: now,
    expiresAt: future,
    stateChangedAt: now,
  }));
  const claims: Claim[] = (
    ["manager_checking", "approved", "paid", "not_paid"] as const
  ).map((state, i) => ({
    id: earnId(p, "claim", i),
    draftId: null,
    taskRecordId: earnId(p, "record", i),
    title: [
      "Check the carrier rate sheet",
      "Count the returned parts",
      "Refill the counter bins",
      "Answer my emails",
    ][i],
    state,
    amountCents: 10000,
    version: 1,
    createdAt: now,
    ...(state === "paid" ? { paidAt: now } : {}),
    ...(state === "not_paid"
      ? {
          reason: "too_generic" as const,
          reasonText:
            "Too generic: everyone writes emails. What is the email for? If it is part of a task only your role does, write that task instead.",
        }
      : {}),
  }));
  const gaps: Gap[] = [
    {
      id: earnId(p, "gap", 0),
      kind: "bottleneck",
      department: "Stores",
      stage: "Check",
      title: "Returns wait for a check",
      whatHappens: "Returned parts wait in the stores tray.",
      measure: { name: "Returns checked a day", today: "12" },
      waiting: { count: 18, days: 2 },
      rewardRangeCents: { min: 0, max: 500000 },
      peopleWorkingOnIt: 1,
      myFixIds: [],
    },
    {
      id: earnId(p, "gap", 1),
      kind: "break",
      department: "Dispatch",
      stage: "Deliver",
      title: "No team receives the exception list",
      whatHappens: "The exception list has no named receiver.",
      peopleWorkingOnIt: 0,
      myFixIds: [],
    },
    {
      id: earnId(p, "gap", 2),
      kind: "one_person",
      department: "Dispatch",
      stage: "Prepare",
      title: "One person makes the labels",
      whatHappens: "Only one person has a confirmed label-making card.",
      peopleWorkingOnIt: 1,
      myFixIds: [],
    },
    {
      id: earnId(p, "gap", 3),
      kind: "empty",
      department: "Service",
      stage: "Decide",
      title: "No card covers substitute parts",
      whatHappens: "The decision stage has no confirmed card.",
      peopleWorkingOnIt: 0,
      myFixIds: [],
    },
  ];
  const fixes: Fix[] = [
    {
      id: earnId(p, "fix", 0),
      version: 1,
      gapId: gaps[0].id,
      text: "Check the returns tray before the dispatch handoff.",
      kind: "new_steps",
      measureName: "Returns checked a day",
      measureBefore: "12",
      measureAfter: "18",
      hoursBefore: 20,
      hoursAfter: 5,
      hoursAfterChecked: 5,
      state: "checking",
      checkDueAt: now,
      bonusCents: 432000,
      createdAt: now,
    },
    {
      id: earnId(p, "fix", 1),
      version: 1,
      gapId: gaps[2].id,
      text: "Train a second person to make labels.",
      kind: "more_people",
      measureName: "Labels ready before dispatch",
      measureBefore: "40",
      hoursBefore: 8,
      hoursAfter: 5,
      state: "sent",
      createdAt: now,
    },
  ];
  const settings: EarnSummary["settings"] = {
    version: 1,
    enabled,
    perCardCents: 10000,
    maxPaidCardsPerPerson: null,
    engagementFeeCents: 0,
    poolCents: 2000000,
    dutygraphKeepsCents: 0,
    poolCommittedCents: 452000,
    poolLeftCents: 1548000,
    bonusRateBp: 1000,
    loadedHourlyRateCents: 6000,
    weeksPerYear: 48,
    bonusCapCents: 500000,
    checkDays: 30,
    payRulesNote: "Your company's pay rules apply.",
    showTitlesToPeers: false,
    payoutMode: "payroll_csv",
    poolFunding: { state: "not_invoiced" },
  };
  const team: TeamBoard = {
    scope: "pod",
    teamTotalCards: 19,
    rows: [
      ["Alex Moreno", "Advisor"],
      ["Dana Cole", "Service coordinator"],
      ["Marcus Lee", "Shipping coordinator"],
      ["Noah Reed", "Dispatch lead"],
      ["Priya Shah", "Stores lead"],
      ["Zoe Ellis", "Service technician"],
    ].map(([name, role], i) => ({
      personId: earnId(p, "person", i),
      name,
      role,
      confirmedCards: [1, 5, 4, 4, 3, 2][i],
      fixes: i === 2 ? 2 : 0,
    })),
  };
  return { drafts, claims, fixes, gaps, settings, team };
}
