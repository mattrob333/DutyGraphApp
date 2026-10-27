/**
 * Native secure storage (Keychain / Android Keystore via expo-secure-store).
 * Used for auth tokens and for pending submissions, which may contain the
 * participant's own words (PRD 27: never discard confirmed review edits;
 * persist a local encrypted pending submission until acknowledged).
 *
 * SecureStore values should stay small, so larger JSON is split into chunks.
 * Web has no keychain: the web build is for design review with mock data and
 * keeps values in memory only.
 */
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const CHUNK = 1800;
const memory = new Map<string, string>();
const isWeb = Platform.OS === "web";
const operations = new Map<string, Promise<unknown>>();
let generation = 0;

/** Serialize reads and writes to one record; drafts may autosave while a send runs. */
function serial<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = operations.get(key) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(operation);
  operations.set(key, next);
  void next
    .finally(() => {
      if (operations.get(key) === next) operations.delete(key);
    })
    .catch(() => {});
  return next;
}

function partsFor(key: string, head: string | null): string[] {
  const current = head && /^chunks:v2:([a-z0-9-]+):(\d+)$/.exec(head);
  if (current)
    return Array.from(
      { length: Number(current[2]) },
      (_, i) => `${key}.${current[1]}.${i}`,
    );
  const legacy = head && /^chunks:(\d+)$/.exec(head);
  return legacy
    ? Array.from({ length: Number(legacy[1]) }, (_, i) => `${key}.${i}`)
    : [];
}

function safeKey(key: string): string {
  // SecureStore keys: alphanumeric, '.', '-', '_'.
  return key.replace(/[^A-Za-z0-9._-]/g, "_");
}

async function rawGet(key: string): Promise<string | null> {
  if (isWeb) return memory.get(key) ?? null;
  return SecureStore.getItemAsync(key);
}

async function rawSet(key: string, value: string): Promise<void> {
  if (isWeb) {
    memory.set(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
  });
}

async function rawDelete(key: string): Promise<void> {
  if (isWeb) {
    memory.delete(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export async function secureGet(key: string): Promise<string | null> {
  const k = safeKey(key);
  return serial(k, async () => {
    const head = await rawGet(k);
    const keys = partsFor(k, head);
    if (!keys.length) return head;
    const parts = await Promise.all(keys.map(rawGet));
    return parts.some((part) => part === null) ? null : parts.join("");
  });
}

export async function secureSet(key: string, value: string): Promise<void> {
  const k = safeKey(key);
  await serial(k, async () => {
    const oldKeys = partsFor(k, await rawGet(k));
    const staged: string[] = [];
    try {
      if (value.length <= CHUNK) {
        await rawSet(k, value);
      } else {
        const revision = `${Date.now().toString(36)}-${(++generation).toString(36)}`;
        const count = Math.ceil(value.length / CHUNK);
        for (let i = 0; i < count; i++) {
          const partKey = `${k}.${revision}.${i}`;
          staged.push(partKey);
          await rawSet(partKey, value.slice(i * CHUNK, (i + 1) * CHUNK));
        }
        // Commit the pointer last: an interrupted write keeps the previous draft readable.
        await rawSet(k, `chunks:v2:${revision}:${count}`);
      }
    } catch (error) {
      await Promise.all(staged.map((part) => rawDelete(part).catch(() => {})));
      throw error;
    }
    await Promise.all(oldKeys.map((part) => rawDelete(part).catch(() => {})));
  });
}

export async function secureDelete(key: string): Promise<void> {
  const k = safeKey(key);
  await serial(k, async () => {
    const keys = partsFor(k, await rawGet(k));
    await rawDelete(k);
    await Promise.all(keys.map(rawDelete));
  });
}

export async function secureGetJson<T>(key: string): Promise<T | null> {
  const v = await secureGet(key);
  if (v === null) return null;
  try {
    return JSON.parse(v) as T;
  } catch {
    return null;
  }
}

export async function secureSetJson(
  key: string,
  value: unknown,
): Promise<void> {
  await secureSet(key, JSON.stringify(value));
}
