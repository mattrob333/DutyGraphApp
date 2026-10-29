/**
 * Participant mobile session tokens (contract: ParticipantMobileSession).
 * Stored only in native secure storage. Never logged.
 */
import { secureDelete, secureGetJson, secureSetJson } from "./secure";

export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  /** ISO timestamp when the access token expires. */
  accessExpiresAt: string;
  refreshExpiresAt?: string;
  sessionId?: string;
  /** Device-local enrollment identity; retained on refresh, replaced on enroll. */
  localSessionId?: string;
  deviceId?: string;
}

const KEY = "dg.companion.session";

let queue: Promise<unknown> = Promise.resolve();
function serial<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.catch(() => {}).then(work);
  queue = next;
  return next;
}
export const tokenStore = {
  get: () => serial(() => secureGetJson<StoredSession>(KEY)),
  set: (s: StoredSession) => serial(() => secureSetJson(KEY, s)),
  clear: () => serial(() => secureDelete(KEY)),
  /** Atomic with enroll/logout writes, for upgrading older stored enrollments. */
  ensureLocalIdentity: (expected: StoredSession, localSessionId: string) =>
    serial(async () => {
      const current = await secureGetJson<StoredSession>(KEY);
      if (
        !current ||
        current.accessToken !== expected.accessToken ||
        current.refreshToken !== expected.refreshToken
      )
        throw new Error(
          "Your session changed. Open this screen again before sending.",
        );
      if (current.localSessionId) return current;
      const updated = { ...current, localSessionId };
      await secureSetJson(KEY, updated);
      return updated;
    }),
};
