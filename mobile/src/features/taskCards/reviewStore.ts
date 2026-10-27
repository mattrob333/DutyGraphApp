import { secureDelete, secureGetJson, secureSetJson } from "@/storage/secure";
import type {
  TaskCardRecord,
  TaskCardDecision,
  TaskDecisionInput,
} from "@/api/extras/types";
export type Choice = { decision?: TaskCardDecision; note: string };
export type TaskReviewDraft = {
  choices: Record<string, Choice>;
  inputs?: TaskDecisionInput[];
  versions: Record<string, string>;
};
let generation = 0;
let writing: Promise<void> = Promise.resolve();
const INDEX = "dg.companion.task-review.index";
const key = (id: string) => `dg.companion.task-review.${id}`;
export const cardVersions = (cards: TaskCardRecord[]) =>
  Object.fromEntries(cards.map((c) => [c.id, `${c.version}:${c.hash}`]));
export async function loadTaskReview(id: string, cards: TaskCardRecord[]) {
  await writing.catch(() => {});
  const draft = await secureGetJson<TaskReviewDraft>(key(id));
  if (
    !draft ||
    JSON.stringify(draft.versions) !== JSON.stringify(cardVersions(cards))
  )
    return null;
  return draft;
}
export async function loadReviewValue<T>(id: string) {
  await writing.catch(() => {});
  return secureGetJson<T>(key(id));
}
export function saveReviewValue(id: string, draft: unknown) {
  const owner = generation;
  const next = writing
    .catch(() => {})
    .then(async () => {
      if (owner !== generation) return;
      await secureSetJson(key(id), draft);
      if (owner !== generation) {
        await secureDelete(key(id));
        return;
      }
      const ids = (await secureGetJson<string[]>(INDEX)) ?? [];
      if (!ids.includes(id)) await secureSetJson(INDEX, [...ids, id]);
    });
  writing = next;
  return next;
}
export const saveTaskReview = (id: string, draft: TaskReviewDraft) =>
  saveReviewValue(id, draft);
export async function clearTaskReview(id: string) {
  await secureDelete(key(id));
}
export async function clearAllTaskReviews() {
  generation++;
  await writing.catch(() => {});
  for (const id of (await secureGetJson<string[]>(INDEX)) ?? [])
    await secureDelete(key(id));
  await secureDelete(INDEX);
}
