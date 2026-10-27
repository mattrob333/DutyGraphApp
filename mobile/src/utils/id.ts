import * as Crypto from 'expo-crypto';

/** Stable client id for utterances and idempotency keys. */
export function newId(prefix?: string): string {
  const id = Crypto.randomUUID();
  return prefix ? `${prefix}_${id}` : id;
}

export function newIdempotencyKey(): string {
  return Crypto.randomUUID();
}
