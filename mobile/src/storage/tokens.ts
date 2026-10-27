/**
 * Participant mobile session tokens (contract: ParticipantMobileSession).
 * Stored only in native secure storage. Never logged.
 */
import { secureDelete, secureGetJson, secureSetJson } from './secure';

export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  /** ISO timestamp when the access token expires. */
  accessExpiresAt: string;
  refreshExpiresAt?: string;
  sessionId?: string;
  deviceId?: string;
}

const KEY = 'dg.companion.session';

export const tokenStore = {
  get: () => secureGetJson<StoredSession>(KEY),
  set: (s: StoredSession) => secureSetJson(KEY, s),
  clear: () => secureDelete(KEY),
};
