/**
 * Device-local state the adapter keeps in secure storage because the 1.1
 * contract has no endpoint for it: conversation drafts (answers the
 * participant typed or spoke but has not sent), notification/voice
 * preferences, and a small log of what this device sent today.
 * Answers are the participant's own words, so they live in the keychain and
 * are wiped on logout (PRD 27).
 */
import { secureDelete, secureGetJson, secureSetJson } from '@/storage/secure';
import type { ConversationMode, ConversationState, Id, InterpretationItem, NotificationPreferences, Utterance, VoicePreferences } from '@/types/domain';
import type { DoneLogEntry, ProposedTaskDto } from './mappers';

export const PREFS_KEY = 'dg.companion.prefs';
const DONE_KEY = 'dg.companion.done';
const INDEX_KEY = 'dg.companion.conv.index';
const convKey = (id: string) => `dg.companion.conv.${id}`;

export interface StoredPrefs {
  notificationPreferences?: Partial<NotificationPreferences>;
  voicePreferences?: Partial<VoicePreferences>;
}

export interface StoredAnswer {
  questionId: string;
  text: string;
  utteranceId: Id;
  source: 'VOICE' | 'TEXT';
  transcriptJobId?: string;
}

export interface CardRef {
  itemId: Id;
  cardId: string;
  version: number;
  hash: string;
  alreadyAttested: boolean;
}

export interface ReviewState {
  kind: 'tasks' | 'words' | 'cards';
  /** The exact text sent to /understanding; submit `text` must equal it (server hash check). */
  sourceText: string;
  understandingHash?: string;
  tasks?: ProposedTaskDto[];
  cards?: CardRef[];
  items: InterpretationItem[];
}

export interface SessionRecord {
  id: Id;
  mode: Extract<ConversationMode, 'DISCOVERY' | 'CONFIRMATION'>;
  requestId: Id;
  title: string;
  opening?: string;
  version: number;
  contentHash: string;
  questionPlanVersion: string;
  questions: { questionId: string; text: string }[];
  taskCardIds: string[];
  utterances: Utterance[];
  answers: StoredAnswer[];
  state: ConversationState;
  startedAt: string;
  endedAt?: string;
  /** Latest transcription job not yet attached to an answer. */
  pendingJobId?: string;
  review?: ReviewState;
}

export const localState = {
  async getPrefs(): Promise<StoredPrefs> {
    return (await secureGetJson<StoredPrefs>(PREFS_KEY)) ?? {};
  },
  setPrefs: (p: StoredPrefs) => secureSetJson(PREFS_KEY, p),

  async getDone(): Promise<DoneLogEntry[]> {
    return (await secureGetJson<DoneLogEntry[]>(DONE_KEY)) ?? [];
  },
  async addDone(e: DoneLogEntry) {
    const cur = (await this.getDone()).filter((d) => d.id !== e.id);
    await secureSetJson(DONE_KEY, [e, ...cur].slice(0, 20));
  },

  getSession: (id: Id) => secureGetJson<SessionRecord>(convKey(id)),
  async saveSession(r: SessionRecord) {
    await secureSetJson(convKey(r.id), r);
    const idx = (await secureGetJson<string[]>(INDEX_KEY)) ?? [];
    if (!idx.includes(r.id)) await secureSetJson(INDEX_KEY, [...idx, r.id]);
  },
  async deleteSession(id: Id) {
    await secureDelete(convKey(id));
    const idx = (await secureGetJson<string[]>(INDEX_KEY)) ?? [];
    await secureSetJson(INDEX_KEY, idx.filter((x) => x !== id));
  },
  /** Logout: remove every draft and the done log. Preferences stay on the device. */
  async clearParticipantData() {
    const idx = (await secureGetJson<string[]>(INDEX_KEY)) ?? [];
    for (const id of idx) await secureDelete(convKey(id));
    await secureDelete(INDEX_KEY);
    await secureDelete(DONE_KEY);
  },
};
