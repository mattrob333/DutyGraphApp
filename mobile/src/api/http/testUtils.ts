import { jest } from '@jest/globals';
import { ApiClient } from './client';

export const hex = (c: string) => c.repeat(64);
export const REQ_ID = '11111111-1111-4111-8111-111111111111';
export const CONF_ID = '22222222-2222-4222-8222-222222222222';
export const JOB_ID = '33333333-3333-4333-8333-333333333333';
export const CARD_A = '44444444-4444-4444-8444-444444444444';
export const CARD_B = '55555555-5555-4555-8555-555555555555';
export const REQ_HASH = hex('a');
export const UNDERSTANDING_HASH = hex('b');

export interface Call {
  method: string;
  path: string;
  headers: Record<string, string>;
  json?: any;
  form?: FormData;
}

export type Reply = { status: number; body?: unknown };
export type Handler = (call: Call, n: number) => Reply | Promise<Reply>;

/** In-memory secure store shared with jest.mock('expo-secure-store'). */
export const secureMap = new Map<string, string>();

export function makeFetch(handler: Handler) {
  const calls: Call[] = [];
  const fn = jest.fn(async (url: string, init: any): Promise<Response> => {
    const path = url.replace(/^https?:\/\/[^/]+\/api\/mobile\/v1/, '');
    const call: Call = { method: init.method, path, headers: { ...(init.headers ?? {}) } };
    if (typeof init.body === 'string') call.json = JSON.parse(init.body);
    else if (init.body) call.form = init.body;
    calls.push(call);
    const r = await handler(call, calls.length);
    const text = r.body === undefined ? '' : JSON.stringify(r.body);
    return {
      status: r.status,
      ok: r.status >= 200 && r.status < 300,
      headers: { get: () => null },
      text: async () => text,
    } as unknown as Response;
  });
  return { fetch: fn as any, calls };
}

export const sessionDto = (n: number, expiresInMs = 15 * 60_000, now = Date.now()) => ({
  tokenType: 'Bearer',
  accessToken: `access-${n}`.padEnd(40, 'x'),
  refreshToken: `refresh-${n}`.padEnd(40, 'y'),
  accessTokenExpiresAt: new Date(now + expiresInMs).toISOString(),
  refreshTokenExpiresAt: new Date(now + 30 * 86400_000).toISOString(),
  role: 'participant_mobile',
  deviceId: '66666666-6666-4666-8666-666666666666',
  idempotentReplay: false,
});

export const profileDto = {
  personId: '77777777-7777-4777-8777-777777777777',
  companyId: '88888888-8888-4888-8888-888888888888',
  name: 'Riley Sample',
  email: 'riley@example.invalid',
  roleTitle: 'Dock Lead',
  team: 'Operations',
  companyName: 'Northwind Demo Co',
};

export const detailDto = (over: Record<string, unknown> = {}) => ({
  requestId: REQ_ID,
  version: 3,
  contentHash: REQ_HASH,
  title: 'How late inbound freight is handled',
  type: 'work',
  state: 'sent',
  dueDate: '2026-10-02',
  questionCount: 2,
  needsYou: true,
  questions: [
    { questionId: 'q1', text: 'What do you do first when a truck is late?' },
    { questionId: 'q2', text: 'Who do you tell, and how?' },
  ],
  questionPlanVersion: 'plan-1',
  gapFollowup: false,
  ...over,
});

export function newClient(fetch: any) {
  let k = 0;
  return new ApiClient({ baseUrl: 'https://x.test/api/mobile/v1', fetch, newKey: () => `key-${++k}` });
}
