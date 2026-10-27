import { describe, expect, it } from '@jest/globals';
import { isAllowedDeepLink, routeFromPush } from '../deepLinks';

describe('isAllowedDeepLink', () => {
  it.each([
    '/questions/req-hf-cobalt',
    '/pulse/pulse-monday-ops',
    '/pulse/abc/conversation',
    '/meetings/m1/avoided',
    '/work/commitments/c1',
    '/clarifications/c1',
    '/discovery/d1',
    '/confirmations/r1',
    '/something-changed',
    '/today',
    '/notifications',
    '/today?from=push',
  ])('allows %s', (r) => expect(isAllowedDeepLink(r)).toBe(true));

  it.each([
    '',
    'today',
    '//evil.com/today',
    'https://evil.com/today',
    '/pulse/',
    '/pulse',
    '/questions/',
    '/me/privacy',
    '/invite',
    '/todayx',
    '/pulse/../invite',
    '/pulse/a\\b',
    '/today://x',
    null,
    undefined,
    42,
    {},
  ])('rejects %p', (r) => expect(isAllowedDeepLink(r as never)).toBe(false));
});

describe('routeFromPush', () => {
  it('opens the route the server sends', () => {
    expect(routeFromPush({ route: '/questions/r1', requestId: 'r1', deepLink: '/mobile/requests/r1' })).toBe('/questions/r1');
    expect(routeFromPush({ route: '/confirmations/r1', requestId: 'r1' })).toBe('/confirmations/r1');
  });

  it('opens the question cards from a request id alone (older server)', () => {
    expect(routeFromPush({ deepLink: '/mobile/requests/0f0e-11', requestId: '0f0e-11' })).toBe('/questions/0f0e-11');
  });

  it('ignores routes and ids outside the allow list', () => {
    expect(routeFromPush({ route: '/invite' })).toBeNull();
    expect(routeFromPush({ route: 'https://evil.com/today', requestId: '../invite' })).toBeNull();
    expect(routeFromPush({ requestId: 'a/b' })).toBeNull();
    expect(routeFromPush(null)).toBeNull();
    expect(routeFromPush('x')).toBeNull();
  });
});
