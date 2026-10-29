import type { ApiClient } from "../http/client";
import { assertParticipantGeneration, getParticipantSessionGeneration } from "../http/client";
import { config } from "../config";
import { CompanionApiError } from "@/types/domain";
import type { EarnRepository } from "./repository";
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
export function localEarnOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return (
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
const defaultDevelopmentFixtures = () =>
  typeof __DEV__ !== "undefined" && __DEV__;
export class HttpEarnRepository implements EarnRepository {
  constructor(
    private client: Pick<ApiClient, "get" | "post">,
    private origin = config.apiBaseUrl,
    private allowDevelopmentFixtures = defaultDevelopmentFixtures(),
  ) {}
  private async environment(): Promise<{
    developmentFixture?: boolean;
    draftCreation?: boolean;
  } | null> {
    let result: { developmentFixture?: boolean; draftCreation?: boolean };
    try {
      result = await this.client.get("/earn/capabilities");
    } catch (error) {
      if ((error as { status?: number }).status === 404) return null;
      throw error;
    }
    if (result.developmentFixture === true && !this.allowDevelopmentFixtures)
      throw new CompanionApiError(
        "NOT_AVAILABLE",
        "This connection contains development examples. Earn is not available in this build.",
        501,
        false,
      );
    return result;
  }
  private async read<T>(path: string): Promise<T> {
    await this.environment();
    return this.client.get<T>(path);
  }
  private async write<T>(path: string, body: unknown, key: string): Promise<T> {
    const owner = getParticipantSessionGeneration();
    await this.environment();
    assertParticipantGeneration(owner);
    return this.client.post<T>(path, body, { idempotencyKey: key });
  }
  getSummary() {
    return this.read<EarnSummary>("/earn/summary");
  }
  listDrafts(state?: DraftState) {
    return this.read<DraftList>(
      "/earn/drafts" + (state ? "?state=" + encodeURIComponent(state) : ""),
    );
  }
  getDraft(id: string) {
    return this.read<TaskCardDraft>("/earn/drafts/" + encodeURIComponent(id));
  }
  confirmDraft(
    id: string,
    expectedVersion: number,
    key: string,
    card?: TaskCardDraftInput,
  ) {
    return this.write<DraftConfirmation>(
      "/earn/drafts/" + encodeURIComponent(id) + "/confirm",
      { expectedVersion, ...(card ? { card } : {}) },
      key,
    );
  }
  notMine(id: string, expectedVersion: number, key: string) {
    return this.write<TaskCardDraft>(
      "/earn/drafts/" + encodeURIComponent(id) + "/not-mine",
      { expectedVersion },
      key,
    );
  }
  getTeamBoard() {
    return this.read<TeamBoard>("/earn/team-board");
  }
  getGaps() {
    return this.read<{ gaps: Gap[] }>("/earn/gaps");
  }
  createFix(input: FixInput, key: string) {
    return this.write<{ fix: Fix; draft?: TaskCardDraft }>(
      "/earn/fixes",
      input,
      key,
    );
  }
  async supportsDraftCreation() {
    if (!this.allowDevelopmentFixtures || !localEarnOrigin(this.origin))
      return false;
    try {
      const value = await this.environment();
      return value?.developmentFixture === true && value.draftCreation === true;
    } catch {
      return false;
    }
  }
  async createDraftFromTask(card: TaskCardDraftInput, key: string) {
    const owner = getParticipantSessionGeneration();
    if (!(await this.supportsDraftCreation()))
      throw new CompanionApiError(
        "NOT_AVAILABLE",
        "Saving a new spoken draft is not turned on for this connection. You can still type your task in the web app.",
        501,
        false,
      );
    assertParticipantGeneration(owner);
    return this.write<DraftCreation>(
      "/earn/drafts",
      { cards: [card], sourceNote: "app" },
      key,
    );
  }
}
