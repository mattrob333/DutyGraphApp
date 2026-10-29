import type {
  Claim,
  DraftChecks,
  Fix,
  SlotKey,
  TaskCardDraftInput,
  TeamBoard,
} from "@/api/earn/types";
export const SLOT_LABELS: Record<SlotKey, string> = {
  startsWhen: "Starts when",
  getsFrom: "Gets from",
  does: "Does",
  handsTo: "Hands to",
  howOften: "How often",
  howLong: "How long",
  onlyIKnow: "Only I know",
};
export const SLOT_KEYS = Object.keys(SLOT_LABELS) as SlotKey[];
export function slotMissing(card: TaskCardDraftInput, key: SlotKey) {
  return (
    card.slots[key].basis === "not_stated" || !card.slots[key].value?.trim()
  );
}
export function formatCents(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: cents % 100 ? 2 : 0,
  }).format(cents / 100);
}
export function paidCardCount(count: number, max: number | null) {
  return max === null
    ? `Paid cards: ${count}`
    : `Paid cards: ${count} of ${max}`;
}
export function teamRows(board: TeamBoard) {
  return [...board.rows].sort((a, b) => a.name.localeCompare(b.name));
}
export function claimLabel(state: Claim["state"]) {
  return {
    manager_checking: "Your manager is checking",
    approved: "Approved",
    paid: "Paid",
    not_paid: "Not paid",
    merged: "Already mapped",
  }[state];
}
export function fixLabel(state: Fix["state"]) {
  return {
    sent: "Sent",
    try_it: "Manager says try it",
    checking: "30-day check",
    paid: "Paid",
    not_paid: "Not paid",
  }[state];
}
export function dateLabel(value?: string) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString()
    : "Not set";
}
export function draftReason(checks: DraftChecks) {
  return checks.earnHintReasons.map((reason) =>
    reason === "too_generic"
      ? "Too generic: everyone writes emails. What is the email for? If it is part of a task only your role does, write that task instead."
      : reason === "not_linked"
        ? "Not linked to your department: this card does not show how it serves your team's goal. Link it, or send it to the team it belongs to."
        : reason === "not_ready"
          ? `Not ready: ${checks.emptySlots.length} slots are empty. Fill them and send it again.`
          : reason === "already_mapped"
            ? "This may already be mapped. Review the possible duplicates."
            : reason === "too_small"
              ? "This needs a clear effect on what the team is measured on."
              : reason === "pool_empty"
                ? "The company's pool for this pilot is used up. This card is still saved to your map."
                : "Your manager must check this card before it can earn.",
  );
}
export function claimReason(claim: Claim) {
  return (
    claim.reasonText ||
    (claim.reason === "too_generic"
      ? "Too generic: everyone writes emails. What is the email for? If it is part of a task only your role does, write that task instead."
      : claim.reason === "not_linked"
        ? "Not linked to your department: this card does not show how it serves your team's goal. Link it, or send it to the team it belongs to."
        : claim.reason === "pool_empty"
          ? "The company's pool for this pilot is used up. This card is still saved to your map."
          : "Open this card with your manager to check why it is not paid.")
  );
}
export function parseHours(value: string) {
  if (
    !/^(?:0|[1-9]\d*)(?:\.\d)?$/.test(value) ||
    !Number.isFinite(Number(value))
  )
    throw new Error(
      "Enter hours as a nonnegative number with at most one decimal.",
    );
  return Number(value);
}
export const GAP_LABELS = {
  bottleneck: "Bottleneck",
  break: "Break",
  one_person: "One person",
  empty: "Empty",
} as const;
