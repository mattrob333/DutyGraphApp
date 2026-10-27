jest.mock('expo-secure-store', () => {
  const { secureMap } = require('../testUtils');
  return {
    AFTER_FIRST_UNLOCK: 1,
    getItemAsync: async (k: string) => secureMap.get(k) ?? null,
    setItemAsync: async (k: string, v: string) => void secureMap.set(k, v),
    deleteItemAsync: async (k: string) => void secureMap.delete(k),
  };
});

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { tokenStore } from '@/storage/tokens';
import { CompanionApiError } from '@/types/domain';
import { ApiClient } from '../client';
import { makeFetch, newClient, secureMap, sessionDto } from '../testUtils';

const store = (n: number, expiresInMs?: number) => {
  const s = sessionDto(n, expiresInMs);
  return tokenStore.set({
    accessToken: s.accessToken,
    refreshToken: s.refreshToken,
    accessExpiresAt: s.accessTokenExpiresAt,
    deviceId: s.deviceId,
  });
};

beforeEach(() => secureMap.clear());

describe('ApiClient', () => {
  it('attaches the bearer token and Idempotency-Key', async () => {
    await store(1);
    const { fetch, calls } = makeFetch(() => ({ status: 200, body: { ok: 1 } }));
    const api = newClient(fetch);
    await api.post('/x', { a: 1 }, { idempotencyKey: 'abc' });
    expect(calls[0].headers.Authorization).toBe(`Bearer ${sessionDto(1).accessToken}`);
    expect(calls[0].headers['Idempotency-Key']).toBe('abc');
    expect(calls[0].json).toEqual({ a: 1 });
  });

  it('refreshes once for concurrent 401s (single flight) and retries each request', async () => {
    await store(1);
    let refreshes = 0;
    const { fetch, calls } = makeFetch((c) => {
      if (c.path === '/session/refresh') {
        refreshes += 1;
        return { status: 200, body: sessionDto(2) };
      }
      return c.headers.Authorization === `Bearer ${sessionDto(2).accessToken}` ? { status: 200, body: { ok: true } } : { status: 401, body: { code: 'SESSION_EXPIRED', message: 'x', retryable: false, requestId: 'r' } };
    });
    const api = newClient(fetch);
    const out = await Promise.all([api.get('/a'), api.get('/b'), api.get('/c')]);
    expect(out).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(refreshes).toBe(1);
    const refreshCall = calls.find((c) => c.path === '/session/refresh')!;
    expect(refreshCall.headers['Idempotency-Key']).toBeTruthy();
    expect(refreshCall.headers.Authorization).toBeUndefined();
    expect(refreshCall.json).toEqual({ refreshToken: sessionDto(1).refreshToken });
    expect((await tokenStore.get())!.refreshToken).toBe(sessionDto(2).refreshToken);
  });

  it('refreshes proactively when the access token is about to expire', async () => {
    await store(1, 10_000);
    const { fetch, calls } = makeFetch((c) => (c.path === '/session/refresh' ? { status: 200, body: sessionDto(2) } : { status: 200, body: {} }));
    await newClient(fetch).get('/me');
    expect(calls.map((c) => c.path)).toEqual(['/session/refresh', '/me']);
    expect(calls[1].headers.Authorization).toBe(`Bearer ${sessionDto(2).accessToken}`);
  });

  it('reuses the refresh Idempotency-Key across retries of the same refresh', async () => {
    await store(1, 1000);
    let n = 0;
    const { fetch, calls } = makeFetch((c) => {
      if (c.path !== '/session/refresh') return { status: 200, body: {} };
      n += 1;
      return n === 1 ? { status: 503, body: { code: 'X', message: 'm', retryable: true, requestId: 'r' } } : { status: 200, body: sessionDto(2) };
    });
    const api = newClient(fetch);
    await expect(api.get('/me')).rejects.toMatchObject({ status: 503 });
    await api.get('/me');
    const keys = calls.filter((c) => c.path === '/session/refresh').map((c) => c.headers['Idempotency-Key']);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  it('ends the session and clears tokens on REFRESH_REPLAY', async () => {
    await store(1);
    const { fetch } = makeFetch((c) =>
      c.path === '/session/refresh'
        ? { status: 401, body: { code: 'REFRESH_REPLAY', message: 'rotated', retryable: false, requestId: 'r' } }
        : { status: 401, body: { code: 'SESSION_EXPIRED', message: 'x', retryable: false, requestId: 'r' } },
    );
    const err: any = await newClient(fetch).get('/me').catch((e: any) => e);
    expect(err).toBeInstanceOf(CompanionApiError);
    expect(err.code).toBe('SESSION_ENDED');
    expect(err.status).toBe(401);
    expect(await tokenStore.get()).toBeNull();
  });

  it('maps the error envelope including retryable and requestId', async () => {
    await store(1);
    const { fetch } = makeFetch(() => ({ status: 429, body: { code: 'DRAFT_LIMIT', message: 'Limit reached', retryable: true, requestId: 'req-9' } }));
    const err = await newClient(fetch).get('/x').catch((e: any) => e);
    expect(err).toMatchObject({ code: 'DRAFT_LIMIT', message: 'Limit reached', status: 429, retryable: true, requestId: 'req-9' });
    const { fetch: f2 } = makeFetch(() => ({ status: 409, body: { code: 'VERSION_CONFLICT', message: 'Changed', retryable: false, requestId: 'r2' } }));
    expect(await newClient(f2).get('/x').catch((e: any) => e)).toMatchObject({ code: 'VERSION_CONFLICT', retryable: false });
  });

  it('turns a network TypeError into NETWORK_OFFLINE with status 0', async () => {
    await store(1);
    const fetch = jest.fn(async () => {
      throw new TypeError('Network request failed');
    });
    const err = await new ApiClient({ baseUrl: 'https://x.test', fetch: fetch as any }).get('/x').catch((e: any) => e);
    expect(err).toMatchObject({ code: 'NETWORK_OFFLINE', status: 0, retryable: true });
  });

  it('times out with a retryable error', async () => {
    await store(1);
    const fetch = jest.fn((_u: string, init: any) => new Promise((_res, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted')))));
    const api = new ApiClient({ baseUrl: 'https://x.test', fetch: fetch as any, timeoutMs: 20 });
    expect(await api.get('/x').catch((e: any) => e)).toMatchObject({ code: 'REQUEST_TIMEOUT', status: 0, retryable: true });
  });

  it('rejects with SESSION_ENDED when there is no session', async () => {
    const { fetch } = makeFetch(() => ({ status: 200, body: {} }));
    expect(await newClient(fetch).get('/me').catch((e: any) => e)).toMatchObject({ code: 'SESSION_ENDED', status: 401 });
  });
});

it("never retries an old request with a replacement enrollment bearer", async () => {
  await store(1);
  let finish!: (reply: { status: number; body: unknown }) => void;
  const { fetch, calls } = makeFetch(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const api = newClient(fetch);
  const outcome = api
    .post("/task-cards/old/attest", { decision: "correct" })
    .catch((e) => e);
  for (let i = 0; i < 20 && !calls.length; i++)
    await new Promise((resolve) => setTimeout(resolve, 1));
  await api.saveSession({
    ...sessionDto(2),
    tokenType: "Bearer",
    role: "participant_mobile",
  });
  finish({ status: 401, body: { code: "SESSION_EXPIRED" } });
  expect(await outcome).toMatchObject({ code: "SESSION_ENDED" });
  expect(calls).toHaveLength(1);
  expect((await tokenStore.get())?.accessToken).toBe(sessionDto(2).accessToken);
});
it("a delayed refresh cannot overwrite a newer enrollment", async () => {
  await store(1, 1000);
  let finish!: (reply: { status: number; body: unknown }) => void;
  const { fetch, calls } = makeFetch(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const api = newClient(fetch);
  const outcome = api.get("/me").catch((e) => e);
  for (let i = 0; i < 20 && !calls.length; i++)
    await new Promise((resolve) => setTimeout(resolve, 1));
  await api.saveSession({
    ...sessionDto(3),
    tokenType: "Bearer",
    role: "participant_mobile",
  });
  finish({ status: 200, body: sessionDto(2) });
  expect(await outcome).toMatchObject({ code: "SESSION_ENDED" });
  expect((await tokenStore.get())?.accessToken).toBe(sessionDto(3).accessToken);
});
it("revokes its captured bearer without clearing a later enrollment", async () => {
  await store(1);
  let finish!: (reply: { status: number; body: unknown }) => void;
  const { fetch, calls } = makeFetch(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const api = newClient(fetch);
  const revocation = api.revokeSession();
  for (let i = 0; i < 20 && !calls.length; i++)
    await new Promise((resolve) => setTimeout(resolve, 1));
  expect(await tokenStore.get()).toBeNull();
  await api.saveSession({
    ...sessionDto(2),
    tokenType: "Bearer",
    role: "participant_mobile",
  });
  finish({ status: 200, body: { ok: true } });
  await revocation;
  expect(calls[0].headers.Authorization).toBe(
    `Bearer ${sessionDto(1).accessToken}`,
  );
  expect((await tokenStore.get())?.accessToken).toBe(sessionDto(2).accessToken);
});
