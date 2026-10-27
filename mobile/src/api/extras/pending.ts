import { clearAllTaskReviews } from "@/features/taskCards/reviewStore";
import { secureDelete, secureGetJson, secureSetJson } from "@/storage/secure";
import { CompanionApiError } from "@/types/domain";
import type { TaskDecisionInput } from "./types";
const KEY = "dg.companion.pending-task-decisions";
let chain: Promise<unknown> = Promise.resolve();
let generation = 0;
export const taskDecisionGeneration = () => generation;
export function assertTaskDecisionGeneration(owner: number) {
  if (owner !== generation)
    throw new CompanionApiError(
      "SESSION_CHANGED",
      "This review belongs to a previous session.",
      409,
      false,
    );
}
export async function pendingTaskDecisions(): Promise<TaskDecisionInput[]> {
  await chain.catch(() => {});
  return (await secureGetJson<TaskDecisionInput[]>(KEY)) ?? [];
}
function change(
  fn: (items: TaskDecisionInput[]) => TaskDecisionInput[],
  owner = generation,
): Promise<void> {
  const next = chain
    .catch(() => {})
    .then(async () => {
      assertTaskDecisionGeneration(owner);
      const items = (await secureGetJson<TaskDecisionInput[]>(KEY)) ?? [];
      assertTaskDecisionGeneration(owner);
      await secureSetJson(KEY, fn(items));
    });
  chain = next;
  return next;
}
export function saveTaskDecision(input: TaskDecisionInput, owner = generation) {
  return change(
    (items) => [
      ...items.filter((i) => i.taskCardId !== input.taskCardId),
      input,
    ],
    owner,
  );
}
export function removeTaskDecision(idempotencyKey: string, owner = generation) {
  return change(
    (items) => items.filter((i) => i.idempotencyKey !== idempotencyKey),
    owner,
  );
}
export function clearPendingTaskDecisions(): Promise<void> {
  generation++;
  const reviews = clearAllTaskReviews();
  const next = chain
    .catch(() => {})
    .then(async () => {
      await secureDelete(KEY);
      await clearAllTaskReviews();
    });
  chain = next;
  return Promise.all([next, reviews]).then(() => {});
}
