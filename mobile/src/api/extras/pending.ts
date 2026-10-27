import { clearAllTaskReviews } from "@/features/taskCards/reviewStore";
import { secureDelete, secureGetJson, secureSetJson } from "@/storage/secure";
import type { TaskDecisionInput } from "./types";
const KEY = "dg.companion.pending-task-decisions";
let chain: Promise<unknown> = Promise.resolve();
export async function pendingTaskDecisions(): Promise<TaskDecisionInput[]> {
  await chain;
  return (await secureGetJson<TaskDecisionInput[]>(KEY)) ?? [];
}
function change(
  fn: (items: TaskDecisionInput[]) => TaskDecisionInput[],
): Promise<void> {
  const next = chain
    .catch(() => {})
    .then(async () => {
      const items = (await secureGetJson<TaskDecisionInput[]>(KEY)) ?? [];
      await secureSetJson(KEY, fn(items));
    });
  chain = next;
  return next;
}
export function saveTaskDecision(input: TaskDecisionInput) {
  return change((items) => [
    ...items.filter((i) => i.taskCardId !== input.taskCardId),
    input,
  ]);
}
export function removeTaskDecision(idempotencyKey: string) {
  return change((items) =>
    items.filter((i) => i.idempotencyKey !== idempotencyKey),
  );
}
export async function clearPendingTaskDecisions() {
  await chain.catch(() => {});
  await secureDelete(KEY);
  await clearAllTaskReviews();
}
