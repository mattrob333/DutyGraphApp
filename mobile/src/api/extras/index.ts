import { useRepository } from "@/api";
import type { CompanionRepository } from "../repository";
import { HttpParticipantExtrasRepository } from "./http";
import { MockParticipantExtrasRepository } from "./mock";
import type { ParticipantExtrasRepository } from "./types";
export * from "./types";
export { clearPendingTaskDecisions } from "./pending";
export { pulseRequestId, pulseIdFromRequest } from "./http";
const instances = new WeakMap<
  CompanionRepository,
  ParticipantExtrasRepository
>();
export function getParticipantExtrasRepository(
  repo: CompanionRepository,
): ParticipantExtrasRepository {
  let extras = instances.get(repo);
  if (!extras) {
    extras =
      repo.kind === "http"
        ? new HttpParticipantExtrasRepository()
        : new MockParticipantExtrasRepository(repo);
    instances.set(repo, extras);
  }
  return extras;
}
export function useParticipantExtrasRepository() {
  return getParticipantExtrasRepository(useRepository());
}

/** Reset demo adapters without retaining acknowledged demo choices. */
export function resetParticipantExtrasRepository(repo: CompanionRepository) {
  instances.delete(repo);
}
