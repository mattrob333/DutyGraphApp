/**
 * Notification deep-link validation. A push payload is data from the network,
 * so only known in-app routes are ever opened (PRD 24).
 */
const PREFIXES = ['/questions/', '/pulse/', '/meetings/', '/work/', '/clarifications/', '/discovery/', '/confirmations/'] as const;
const EXACT = ['/something-changed', '/today', '/notifications'] as const;

export function isAllowedDeepLink(route: unknown): route is string {
  if (typeof route !== 'string' || route.length === 0 || route.length > 512) return false;
  if (!route.startsWith('/') || route.startsWith('//')) return false;
  if (/[\\\s]|\.\.|:\/\//.test(route)) return false;
  const path = route.split(/[?#]/)[0];
  if (EXACT.some((e) => path === e || path.startsWith(`${e}/`))) return true;
  return PREFIXES.some((p) => path.startsWith(p) && path.length > p.length);
}

/**
 * The screen a push tap opens. The server sends `route` (`/questions/<id>` for work questions,
 * `/confirmations/<id>` for task checks); an older server sends only `requestId`, which opens the
 * question cards. Anything else is ignored.
 */
export function routeFromPush(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (isAllowedDeepLink(d.route)) return d.route;
  if (typeof d.requestId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(d.requestId)) {
    const route = `/questions/${d.requestId}`;
    return isAllowedDeepLink(route) ? route : null;
  }
  return null;
}
