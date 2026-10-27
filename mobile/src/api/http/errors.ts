import { CompanionApiError } from '@/types/domain';

export { CompanionApiError };

export const NOT_AVAILABLE_MESSAGE = "This isn't available on your account yet.";

/** Operations the pinned 1.1 contract does not offer yet. */
export function notAvailable(): Promise<never> {
  return Promise.reject(new CompanionApiError('NOT_AVAILABLE', NOT_AVAILABLE_MESSAGE, 501, false));
}

interface Envelope {
  code?: unknown;
  message?: unknown;
  retryable?: unknown;
  requestId?: unknown;
}

/**
 * Maps a non-2xx response to CompanionApiError using the server envelope
 * `{ code, message, retryable, requestId }`. Falls back to status-derived
 * values when the body is not the envelope (proxy pages, gateway timeouts).
 * The body is never logged.
 */
export function errorFromResponse(status: number, raw: string, headerRequestId?: string | null): CompanionApiError {
  let env: Envelope | null = null;
  try {
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object') env = parsed as Envelope;
  } catch {
    env = null;
  }
  const code = typeof env?.code === 'string' && env.code ? env.code : `HTTP_${status}`;
  const message =
    typeof env?.message === 'string' && env.message ? env.message : 'Something went wrong. Please try again.';
  const retryable = typeof env?.retryable === 'boolean' ? env.retryable : status === 429 || status >= 500;
  const requestId = typeof env?.requestId === 'string' ? env.requestId : (headerRequestId ?? undefined);
  return new CompanionApiError(code, message, status, retryable, requestId ?? undefined);
}

export const networkOffline = () =>
  new CompanionApiError('NETWORK_OFFLINE', "You're offline. Check your connection and try again.", 0, true);

export const requestTimeout = () =>
  new CompanionApiError('REQUEST_TIMEOUT', 'That took too long. Please try again.', 0, true);

export const sessionEnded = () =>
  new CompanionApiError('SESSION_ENDED', 'Your session has ended. Open your invitation again to reconnect.', 401, false);

/** Understanding failures that should fall back to "send my words" (contract 1.1). */
export function isUnderstandingUnavailable(e: unknown): boolean {
  if (!(e instanceof CompanionApiError)) return false;
  return (
    e.status === 429 ||
    e.status === 503 ||
    e.status === 504 ||
    e.code === 'UNDERSTANDING_NOT_CONFIGURED' ||
    e.code === 'UNDERSTANDING_TIMEOUT' ||
    e.code === 'DRAFT_LIMIT'
  );
}
