import { secureDelete, secureGetJson, secureSetJson } from "./secure";
import type { AdvisorSession, KickoffNote } from "@/api/advisor/types";
import { newIdempotencyKey } from "@/utils/id";
const SESSION = "dg.advisor.session";
const DRAFTS = "dg.advisor.draft-keys";
const COMMANDS = "dg.advisor.command-keys";
let writing = Promise.resolve();
let generation = 0;
let clearing = false;
export const advisorTokens = {
  get: () => secureGetJson<AdvisorSession>(SESSION),
  set: (s: AdvisorSession) => secureSetJson(SESSION, s),
  clear: () => secureDelete(SESSION),
};
export async function saveAdvisorDraft<T>(id: string, draft: T): Promise<void> {
  if (clearing) return;
  const epoch = generation;
  const operation = writing.then(async () => {
    if (epoch !== generation) return;
    const key = `dg.advisor.draft.${id}`;
    const keys = (await secureGetJson<string[]>(DRAFTS)) ?? [];
    if (!keys.includes(key)) await secureSetJson(DRAFTS, [...keys, key]);
    await secureSetJson(key, draft);
  });
  writing = operation.catch(() => {});
  await operation;
}
export const loadAdvisorDraft = <T>(id: string) =>
  secureGetJson<T>(`dg.advisor.draft.${id}`);
/** The secure ledger retains failed commands independently across hooks and restarts. */
export async function advisorCommandKey(signature: string): Promise<string> {
  if (clearing) throw new Error("Advisor session is ending.");
  const epoch = generation;
  let key = "";
  const operation = writing.then(async () => {
    if (epoch !== generation) throw new Error("Advisor session ended.");
    const ledger =
      (await secureGetJson<Record<string, string>>(COMMANDS)) ?? {};
    key = ledger[signature] ?? newIdempotencyKey();
    ledger[signature] = key;
    await secureSetJson(COMMANDS, ledger);
  });
  writing = operation.catch(() => {});
  await operation;
  return key;
}
export async function acknowledgeAdvisorCommand(
  signature: string,
  key: string,
): Promise<void> {
  const epoch = generation;
  const operation = writing.then(async () => {
    if (epoch !== generation || clearing) return;
    const ledger =
      (await secureGetJson<Record<string, string>>(COMMANDS)) ?? {};
    if (ledger[signature] === key) {
      delete ledger[signature];
      await secureSetJson(COMMANDS, ledger);
    }
  });
  writing = operation.catch(() => {});
  await operation;
}
export const saveKickoffNotes = (id: string, notes: KickoffNote[]) =>
  saveAdvisorDraft(`kickoff.${id}`, notes);
export const loadKickoffNotes = (id: string) =>
  loadAdvisorDraft<KickoffNote[]>(`kickoff.${id}`);
export async function clearAdvisorData(): Promise<void> {
  clearing = true;
  const epoch = ++generation;
  const operation = writing.then(async () => {
    for (const key of (await secureGetJson<string[]>(DRAFTS)) ?? [])
      await secureDelete(key);
    await secureDelete(DRAFTS);
    await secureDelete(COMMANDS);
    await advisorTokens.clear();
  });
  writing = operation.catch(() => {});
  try {
    await operation;
  } finally {
    if (epoch === generation) clearing = false;
  }
}
