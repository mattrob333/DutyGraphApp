import { useMemo } from "react";
import { getRepository, useRepository } from "../index";
import type { CompanionRepository } from "../repository";
import { HttpCompanionRepository } from "../http/HttpCompanionRepository";
import { CompanionApiError } from "@/types/domain";
import { HttpEarnRepository } from "./HttpEarnRepository";
import type { EarnRepository } from "./repository";
export type { EarnRepository } from "./repository";
export * from "./types";
const unavailable = async (): Promise<never> => {
  throw new CompanionApiError(
    "NOT_AVAILABLE",
    "This part is not turned on yet.",
    501,
    false,
  );
};
/** Existing mock mode never opens a real connection or bundles Earn seed data. */
export class UnavailableEarnRepository implements EarnRepository {
  getSummary = unavailable;
  listDrafts = unavailable;
  getDraft = unavailable;
  confirmDraft = unavailable;
  notMine = unavailable;
  getTeamBoard = unavailable;
  getGaps = unavailable;
  createFix = unavailable;
  createDraftFromTask = unavailable;
  supportsDraftCreation = async () => false;
}
let injected: EarnRepository | null = null;
const repositories = new WeakMap<CompanionRepository, EarnRepository>();
export function getEarnRepository(
  companion: CompanionRepository = getRepository(),
): EarnRepository {
  if (injected) return injected;
  const saved = repositories.get(companion);
  if (saved) return saved;
  const value =
    companion instanceof HttpCompanionRepository
      ? new HttpEarnRepository(
          companion.getExtensionApiClient(),
          companion.getExtensionApiClient().getBaseUrl(),
        )
      : new UnavailableEarnRepository();
  repositories.set(companion, value);
  return value;
}
export function useEarnRepository(): EarnRepository {
  const companion = useRepository();
  return useMemo(() => getEarnRepository(companion), [companion]);
}
/** Tests may inject an adapter; production screens never select fixture identities. */
export function setEarnRepository(value: EarnRepository | null) {
  injected = value;
}
