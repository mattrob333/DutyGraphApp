import type { components } from "../generated/earn-mobile";
type S = components["schemas"];
export type TaskCardDraftInput = S["TaskCardDraftInput"];
export type TaskCardDraft = S["TaskCardDraft"];
export type DraftChecks = S["DraftChecks"];
export type Claim = S["Claim"];
export type Fix = S["Fix"];
export type Gap = S["Gap"];
export type TeamBoard = S["TeamBoard"];
export type EarnSummary = S["EarnSummary"];
export type EarnSettingsView = EarnSummary["settings"];
export type SlotKey = keyof TaskCardDraftInput["slots"];
export type Slot = TaskCardDraftInput["slots"][SlotKey];
export type Step = TaskCardDraftInput["steps"][number];
export type DraftState = TaskCardDraft["state"];
export type FixInput = Pick<
  Fix,
  "text" | "kind" | "measureName" | "hoursBefore" | "hoursAfter"
> & { gapId?: string; measureBefore?: string; card?: TaskCardDraftInput };
export type DraftList = {
  drafts: TaskCardDraft[];
  counts: Record<DraftState, number>;
};
export type DraftCreation = {
  drafts: TaskCardDraft[];
  refused: { index: number; code: string; message: string }[];
};
export type DraftConfirmation = {
  draft: TaskCardDraft;
  taskRecordId: string;
  claim?: Claim;
};

export type SlotBasis = Slot["basis"];
export type StepObject = Exclude<Step, string>;
export type WorkType = TaskCardDraftInput["workType"];
export type CardKind = TaskCardDraftInput["kind"];
export type FitScores = NonNullable<TaskCardDraftInput["fit"]>;
export type ChainLinks = NonNullable<TaskCardDraftInput["links"]>;
export type NotPaidReason = NonNullable<Claim["reason"]>;
export type ClaimState = Claim["state"];
export type FixKind = Fix["kind"];
export type FixState = Fix["state"];
export type GapKind = Gap["kind"];
export type DraftVia = TaskCardDraft["via"];
