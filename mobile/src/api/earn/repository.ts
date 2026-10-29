import type {
  DraftConfirmation,
  DraftCreation,
  DraftList,
  DraftState,
  EarnSummary,
  Fix,
  FixInput,
  Gap,
  TaskCardDraft,
  TaskCardDraftInput,
  TeamBoard,
} from "./types";
export interface EarnRepository {
  getSummary(): Promise<EarnSummary>;
  listDrafts(state?: DraftState): Promise<DraftList>;
  getDraft(id: string): Promise<TaskCardDraft>;
  confirmDraft(
    id: string,
    expectedVersion: number,
    key: string,
    card?: TaskCardDraftInput,
  ): Promise<DraftConfirmation>;
  notMine(
    id: string,
    expectedVersion: number,
    key: string,
  ): Promise<TaskCardDraft>;
  getTeamBoard(): Promise<TeamBoard>;
  getGaps(): Promise<{ gaps: Gap[] }>;
  createFix(
    input: FixInput,
    key: string,
  ): Promise<{ fix: Fix; draft?: TaskCardDraft }>;
  supportsDraftCreation(): Promise<boolean>;
  createDraftFromTask(
    card: TaskCardDraftInput,
    key: string,
  ): Promise<DraftCreation>;
}
