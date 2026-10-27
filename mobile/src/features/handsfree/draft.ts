/**
 * One request's hands-free run, kept on the phone until the server acknowledges the send
 * (docs/specs/COMPANION-HANDS-FREE.md §6.2): the card answers, "Here's what we heard", the
 * person's review edits and the idempotency key of the first send. A restart resumes at the first
 * unanswered card, or on the review when every card is done. Logout removes every draft
 * (`clearAllDrafts`, found through an index of request ids).
 *
 * The deck, review and sent screens share it through an in-memory store; every change is also
 * written to secure storage (it holds the person's own words). A draft whose questions changed on
 * the server (other content hash or keys) is dropped rather than applied to different questions.
 */
import { useEffect, useState } from "react";
import { create } from "zustand";
import type { DeckMode } from "@shared/hands-free/deck";
import { secureDelete, secureGetJson, secureSetJson } from "@/storage/secure";
import type {
  CardAnswer,
  QuestionKey,
  QuestionSet,
  UnderstoodAnswer,
} from "@/types/handsfree";

const OWNER = Symbol("hands-free draft owner");
let generation = 0;
let writes: Promise<void> = Promise.resolve();
export type DraftOwner = number;
export const captureDraftOwner = (): DraftOwner => generation;
export const isDraftOwnerCurrent = (owner: DraftOwner) => owner === generation;

export type HandsFreeDraft = {
  [OWNER]?: DraftOwner;
  v: 1;
  requestId: string;
  contentHash: string;
  keys: QuestionKey[];
  /** One per card, same order as the question set's questions. */
  answers: (CardAnswer | null)[];
  mode: DeckMode;
  /** ISO time the cards were first opened ("That took about N minutes"). */
  startedAt: string;
  /** "Here's what we heard": the items, null when it was unavailable, undefined before asking. */
  understood?: UnderstoodAnswer[] | null;
  /** Review edits by key. */
  edits: Partial<Record<QuestionKey, string>>;
  /** Created on the first Send and reused for every retry. */
  idempotencyKey?: string;
};

const storageKey = (requestId: string) => `dg.companion.handsfree.${requestId}`;
/** Request ids with a draft in storage, so logout can find them. */
const INDEX = "dg.companion.handsfree.index";
/** Ids known to be in the index in this run (saves are frequent; the index is read once per id). */
const indexed = new Set<string>();

async function readIndex(): Promise<string[]> {
  const ids = await secureGetJson<string[]>(INDEX).catch(() => null);
  return Array.isArray(ids) ? ids : [];
}

async function addToIndex(requestId: string): Promise<void> {
  if (indexed.has(requestId)) return;
  const ids = await readIndex();
  if (!ids.includes(requestId)) await secureSetJson(INDEX, [...ids, requestId]);
  indexed.add(requestId);
}

type DraftState = {
  drafts: Record<string, HandsFreeDraft | undefined>;
  put: (d: HandsFreeDraft) => void;
  drop: (requestId: string) => void;
  reset: () => void;
};

export const useDraftStore = create<DraftState>()((set) => ({
  drafts: {},
  put: (d) => set((s) => ({ drafts: { ...s.drafts, [d.requestId]: d } })),
  drop: (requestId) =>
    set((s) => ({ drafts: { ...s.drafts, [requestId]: undefined } })),
  reset: () => set({ drafts: {} }),
}));

/** A new draft for a question set: nothing answered yet. */
export function newDraft(
  set: QuestionSet,
  mode: DeckMode,
  now = new Date(),
): HandsFreeDraft {
  return {
    [OWNER]: generation,
    v: 1,
    requestId: set.requestId,
    contentHash: set.contentHash,
    keys: set.questions.map((q) => q.key),
    answers: set.questions.map(() => null),
    mode,
    startedAt: now.toISOString(),
    edits: {},
  };
}

/** True when a saved draft still fits these questions. */
export function draftFits(
  d: HandsFreeDraft | null | undefined,
  set: QuestionSet,
): d is HandsFreeDraft {
  return (
    !!d &&
    d.v === 1 &&
    d.contentHash === set.contentHash &&
    d.keys.length === set.questions.length &&
    d.keys.every((k, i) => k === set.questions[i].key) &&
    Array.isArray(d.answers) &&
    d.answers.length === set.questions.length
  );
}

/** Reads the draft from memory, else from secure storage. Null when there is none or it no longer fits. */
export async function loadDraft(
  set: QuestionSet,
): Promise<HandsFreeDraft | null> {
  const owner = generation;
  await writes.catch(() => {});
  if (!isDraftOwnerCurrent(owner)) return null;
  const mem = useDraftStore.getState().drafts[set.requestId];
  if (mem) return draftFits(mem, set) ? mem : null;
  let stored: HandsFreeDraft | null = null;
  try {
    stored = await secureGetJson<HandsFreeDraft>(storageKey(set.requestId));
  } catch {
    stored = null;
  }
  if (!isDraftOwnerCurrent(owner) || !draftFits(stored, set)) return null;
  stored = { ...stored, [OWNER]: owner };
  useDraftStore.getState().put(stored);
  return stored;
}

/** Saves only within the session that created this draft or callback. Symbols never enter JSON storage. */
export function saveDraft(
  d: HandsFreeDraft,
  owner: DraftOwner = d[OWNER] ?? generation,
): Promise<void> {
  if (
    !isDraftOwnerCurrent(owner) ||
    (d[OWNER] !== undefined && d[OWNER] !== owner)
  )
    return Promise.resolve();
  const next = { ...d, [OWNER]: owner };
  useDraftStore.getState().put(next);
  const saving = writes
    .catch(() => {})
    .then(async () => {
      if (!isDraftOwnerCurrent(owner)) return;
      await secureSetJson(storageKey(next.requestId), next);
      if (!isDraftOwnerCurrent(owner)) return;
      await addToIndex(next.requestId);
    })
    .catch(() => {});
  writes = saving;
  return saving;
}

/** A delayed understanding, edit or callback must never patch a replacement session's draft. */
export function updateDraft(
  requestId: string,
  patch: Partial<HandsFreeDraft>,
  owner: DraftOwner = generation,
  expectedContentHash?: string,
): Promise<void> {
  if (!isDraftOwnerCurrent(owner)) return Promise.resolve();
  const d = useDraftStore.getState().drafts[requestId];
  if (
    !d ||
    (expectedContentHash !== undefined && d.contentHash !== expectedContentHash)
  )
    return Promise.resolve();
  return saveDraft({ ...d, ...patch }, owner);
}

/** After acknowledgement; a prior session's late acknowledgement cannot erase a new draft. */
export function clearDraft(
  requestId: string,
  owner: DraftOwner = generation,
  expectedContentHash?: string,
): Promise<void> {
  if (!isDraftOwnerCurrent(owner)) return Promise.resolve();
  const current = useDraftStore.getState().drafts[requestId];
  if (
    expectedContentHash !== undefined &&
    current &&
    current.contentHash !== expectedContentHash
  )
    return Promise.resolve();
  const clearing = writes
    .catch(() => {})
    .then(async () => {
      if (isDraftOwnerCurrent(owner)) await secureDelete(storageKey(requestId));
    })
    .catch(() => {});
  writes = clearing;
  useDraftStore.getState().drop(requestId);
  return clearing;
}

/** Invalidate callbacks immediately, then serialize deletion before any replacement session writes. */
export function clearAllDrafts(): Promise<void> {
  generation++;
  const priorIds = new Set([
    ...indexed,
    ...Object.keys(useDraftStore.getState().drafts),
  ]);
  const clearing = writes
    .catch(() => {})
    .then(async () => {
      const ids = new Set([...(await readIndex()), ...priorIds]);
      for (const id of ids) await secureDelete(storageKey(id)).catch(() => {});
      await secureDelete(INDEX).catch(() => {});
    });
  writes = clearing;
  useDraftStore.getState().reset();
  indexed.clear();
  return clearing;
}

/** The draft for a question set once loaded: `undefined` while loading, `null` when there is none. */
export function useDraft(
  set: QuestionSet | undefined,
): HandsFreeDraft | null | undefined {
  const mem = useDraftStore((s) => (set ? s.drafts[set.requestId] : undefined));
  const [loaded, setLoaded] = useState<string | null>(null);
  useEffect(() => {
    if (!set) return;
    let alive = true;
    loadDraft(set).finally(() => alive && setLoaded(set.requestId));
    return () => {
      alive = false;
    };
  }, [set]);
  if (!set) return undefined;
  if (mem && draftFits(mem, set)) return mem;
  return loaded === set.requestId ? null : undefined;
}
