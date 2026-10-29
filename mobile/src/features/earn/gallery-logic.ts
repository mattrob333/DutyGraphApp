/**
 * Task Card gallery rules shared with the web client (DutyGraphV2 client/src/earn/MyWork.tsx).
 * Spec: /mnt/project-files/app-ux/task-card-gallery-spec.md (approved by matt, October 29).
 */
import type {
  Claim,
  DiscoveryList,
  TaskCardDraft,
  WorkType,
} from "@/api/earn/types";
import { formatCents, slotMissing } from "./logic";

export const WORK_TYPE_LABELS: Record<WorkType, string> = {
  manual: "Manual",
  digital: "AI help",
  mixed: "Mixed",
};
export type GalleryFilter = "all" | WorkType;
export const GALLERY_FILTERS: { key: GalleryFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "manual", label: "Manual" },
  { key: "digital", label: "AI help" },
  { key: "mixed", label: "Mixed" },
];
/** A waiting card is "New" for 15 minutes after it arrives. */
export const NEW_FOR_MS = 15 * 60 * 1000;

export type CardStatus = { label: string; kind: "new" | "check" | "done" };
export function cardStatus(
  draft: TaskCardDraft,
  claim: Claim | undefined,
  now: number = Date.now(),
): CardStatus {
  if (draft.state === "waiting")
    return now - new Date(draft.createdAt).getTime() < NEW_FOR_MS
      ? { label: "New", kind: "new" }
      : { label: "Check it", kind: "check" };
  switch (claim?.state) {
    case "manager_checking":
      return { label: "Manager checking", kind: "done" };
    case "approved":
      return { label: "Approved", kind: "done" };
    case "paid":
      return { label: `Earned ${formatCents(claim.amountCents)}`, kind: "done" };
    case "not_paid":
      return { label: "Not paid", kind: "check" };
    default:
      return { label: "Confirmed", kind: "done" };
  }
}

/** Waiting cards first (newest first), then confirmed cards. */
export function galleryCards(waiting: TaskCardDraft[], confirmed: TaskCardDraft[]) {
  const byNewest = (a: TaskCardDraft, b: TaskCardDraft) =>
    b.createdAt.localeCompare(a.createdAt);
  return [...waiting].sort(byNewest).concat([...confirmed].sort(byNewest));
}

export const sameTitle = (title: string) =>
  title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export type AiRow = {
  key: string;
  title: string;
  line: string;
  done: number;
  of: number;
  stage: "asking" | "check" | "ready";
  pill: string;
};
/** One row per task still with the person's AI. A task leaves once a card has the same title. */
export function withAiRows(list: DiscoveryList | null, cards: TaskCardDraft[]): AiRow[] {
  const titles = new Set(cards.map((d) => sameTitle(d.card.title)));
  const seen = new Set<string>();
  const rows: AiRow[] = [];
  for (const discovery of list?.discoveries ?? [])
    for (const c of discovery.candidates) {
      const key = sameTitle(c.title);
      if (titles.has(key) || seen.has(key)) continue;
      seen.add(key);
      const stage = c.draftId ? "ready" : c.readyForReview ? "check" : "asking";
      rows.push({
        key: `${discovery.discoveryId}:${c.candidateId}`,
        title: c.title,
        done: stage === "ready" ? c.requiredOf : c.requiredDone,
        of: c.requiredOf,
        stage,
        line:
          stage === "ready"
            ? "Card ready. It moved to your cards."
            : stage === "check"
              ? "Your AI shows you the card. Say yes in the chat."
              : `${c.answers} answer${c.answers === 1 ? "" : "s"} so far`,
        pill:
          stage === "ready"
            ? "✓ Card ready"
            : stage === "check"
              ? "Check it in the chat"
              : "Your AI is asking",
      });
    }
  return rows;
}

export const tileFooter = (draft: TaskCardDraft) =>
  [
    slotMissing(draft.card, "howOften") ? null : draft.card.slots.howOften.value,
    slotMissing(draft.card, "howLong") ? null : draft.card.slots.howLong.value,
  ]
    .filter(Boolean)
    .join(" · ") || "How often not stated";
