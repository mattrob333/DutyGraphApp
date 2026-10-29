import { secureGetJson, secureSetJson } from "@/storage/secure";
import { tokenStore } from "@/storage/tokens";
import { config } from "@/api/config";
import { getParticipantSessionGeneration } from "@/api/http/client";
import { newIdempotencyKey } from "@/utils/id";

const STORAGE = "dg.companion.earn.pending.v1";
type RecordEntry = {
  origin: string;
  sessionId: string;
  operation: string;
  body: unknown;
  signature: string;
  key: string;
};
let serial: Promise<unknown> = Promise.resolve();
function locked<T>(work: () => Promise<T>): Promise<T> {
  const next = serial.catch(() => {}).then(work);
  serial = next;
  return next;
}
async function identity() {
  const generation = getParticipantSessionGeneration();
  let session = await tokenStore.get();
  if (!session?.deviceId)
    throw new Error("Sign in again before sending this change.");
  if (!session.localSessionId) {
    // Upgrade an existing enrollment without storing or deriving an identity from secret tokens.
    const latest = await tokenStore.get();
    if (
      generation !== getParticipantSessionGeneration() ||
      latest?.accessToken !== session.accessToken ||
      latest?.refreshToken !== session.refreshToken
    )
      throw new Error(
        "Your session changed. Open this screen again before sending.",
      );
    session = await tokenStore.ensureLocalIdentity(
      session,
      newIdempotencyKey(),
    );
  }
  if (generation !== getParticipantSessionGeneration())
    throw new Error(
      "Your session changed. Open this screen again before sending.",
    );
  return {
    sessionId: `${session.deviceId}:${session.localSessionId}`,
    origin: config.apiBaseUrl,
    generation,
  };
}
/** Native secure storage retains exact reviewed words and command identity until acknowledgement.
 * Web's existing secure abstraction is memory only. Never automatically replay on opening a screen.
 */
export async function runPendingEarnCommand<T>(
  operation: string,
  body: unknown,
  send: (key: string) => Promise<T>,
): Promise<T> {
  const owner = await identity();
  const assertOwner = async () => {
    const current = await identity();
    if (JSON.stringify(current) !== JSON.stringify(owner))
      throw new Error(
        "Your session changed. Open this screen again before sending.",
      );
  };
  // JSON snapshot protects the persisted command against mutation during an asynchronous write.
  const signature = JSON.stringify({ operation, body });
  const exactBody: unknown = JSON.parse(JSON.stringify(body));
  const entry = await locked(async () => {
    await assertOwner();
    const entries = (await secureGetJson<RecordEntry[]>(STORAGE)) ?? [];
    const existing = entries.find(
      (item) =>
        item.origin === owner.origin &&
        item.sessionId === owner.sessionId &&
        item.signature === signature,
    );
    if (existing) return existing;
    const created = {
      origin: owner.origin,
      sessionId: owner.sessionId,
      operation,
      body: exactBody,
      signature,
      key: newIdempotencyKey(),
    };
    await secureSetJson(STORAGE, [...entries, created]);
    return created;
  });
  await assertOwner();
  const result = await send(entry.key);
  await assertOwner();
  await locked(async () => {
    await assertOwner();
    const entries = (await secureGetJson<RecordEntry[]>(STORAGE)) ?? [];
    await secureSetJson(
      STORAGE,
      entries.filter(
        (item) =>
          !(
            item.origin === entry.origin &&
            item.sessionId === entry.sessionId &&
            item.key === entry.key
          ),
      ),
    );
  });
  await assertOwner();
  return result;
}
