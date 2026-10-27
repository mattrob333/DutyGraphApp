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
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const CHUNK = 1800;
const memory = new Map<string, string>();
const isWeb = Platform.OS === 'web';

function safeKey(key: string): string {
  // SecureStore keys: alphanumeric, '.', '-', '_'.
  return key.replace(/[^A-Za-z0-9._-]/g, '_');
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
  await SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK });
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
  const head = await rawGet(k);
  if (head === null) return null;
  const m = /^chunks:(\d+)$/.exec(head);
  if (!m) return head;
  const parts: string[] = [];
  for (let i = 0; i < Number(m[1]); i++) {
    const part = await rawGet(`${k}.${i}`);
    if (part === null) return null;
    parts.push(part);
  }
  return parts.join('');
}

export async function secureSet(key: string, value: string): Promise<void> {
  const k = safeKey(key);
  await secureDelete(key);
  if (value.length <= CHUNK) {
    await rawSet(k, value);
    return;
  }
  const count = Math.ceil(value.length / CHUNK);
  for (let i = 0; i < count; i++) await rawSet(`${k}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK));
  await rawSet(k, `chunks:${count}`);
}

export async function secureDelete(key: string): Promise<void> {
  const k = safeKey(key);
  const head = await rawGet(k);
  const m = head ? /^chunks:(\d+)$/.exec(head) : null;
  if (m) for (let i = 0; i < Number(m[1]); i++) await rawDelete(`${k}.${i}`);
  await rawDelete(k);
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

export async function secureSetJson(key: string, value: unknown): Promise<void> {
  await secureSet(key, JSON.stringify(value));
}
