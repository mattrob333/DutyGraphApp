/**
 * Pending submissions and text drafts (PRD 27).
 *
 * A pending submission is the participant's reviewed items plus the
 * idempotency key used for the first attempt. It stays on the device until
 * the server acknowledges it or the participant explicitly discards it.
 * Retrying with the same key cannot create a duplicate.
 */
import type { InterpretationItem } from '@/types/domain';
import { secureDelete, secureGetJson, secureSetJson } from './secure';

export interface PendingSubmission {
  sessionId: string;
  idempotencyKey: string;
  items: InterpretationItem[];
  savedAt: string;
  attempts: number;
}

const INDEX = 'dg.companion.pending.index';
const keyFor = (sessionId: string) => `dg.companion.pending.${sessionId}`;

async function readIndex(): Promise<string[]> {
  return (await secureGetJson<string[]>(INDEX)) ?? [];
}

export const pendingSubmissions = {
  async save(p: PendingSubmission): Promise<void> {
    await secureSetJson(keyFor(p.sessionId), p);
    const idx = await readIndex();
    if (!idx.includes(p.sessionId)) await secureSetJson(INDEX, [...idx, p.sessionId]);
  },
  get: (sessionId: string) => secureGetJson<PendingSubmission>(keyFor(sessionId)),
  async list(): Promise<PendingSubmission[]> {
    const out: PendingSubmission[] = [];
    for (const id of await readIndex()) {
      const p = await secureGetJson<PendingSubmission>(keyFor(id));
      if (p) out.push(p);
    }
    return out;
  },
  async remove(sessionId: string): Promise<void> {
    await secureDelete(keyFor(sessionId));
    const idx = await readIndex();
    await secureSetJson(INDEX, idx.filter((i) => i !== sessionId));
  },
};

/** Typed answer being composed, kept if the app is closed mid-conversation. */
const draftKey = (sessionId: string) => `dg.companion.draft.${sessionId}`;
export const textDrafts = {
  get: (sessionId: string) => secureGetJson<{ text: string }>(draftKey(sessionId)).then((d) => d?.text ?? ''),
  set: (sessionId: string, text: string) =>
    text ? secureSetJson(draftKey(sessionId), { text }) : secureDelete(draftKey(sessionId)),
  clear: (sessionId: string) => secureDelete(draftKey(sessionId)),
};
