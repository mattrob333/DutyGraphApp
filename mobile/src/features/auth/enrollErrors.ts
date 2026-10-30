import { CompanionApiError } from '@/types/domain';
import { config, type BackendProfile } from '@/api/config';

export type EnrollFailure = { kind: 'expired' | 'useWeb' | 'other'; message: string };

/** Plain-language outcome for a failed invitation exchange. Never includes the token. */
export function describeEnrollError(e: unknown): EnrollFailure {
  if (e instanceof CompanionApiError) {
    if (e.status === 410 || e.code === 'INVITATION_EXPIRED') {
      return { kind: 'expired', message: 'This link has expired or was already used. Ask your advisor for a new one.' };
    }
    if (e.status === 409 && e.code === 'USE_WEB_LINK') {
      return { kind: 'useWeb', message: 'This invitation opens in your browser instead of the app. Tap below to continue there.' };
    }
  }
  return { kind: 'other', message: fallbackMessage(e) };
}

export const ENROLL_ORIGIN = 'https://respond.dutygraph.com';

/**
 * Production invitations use the HTTPS App Link. Development and mock builds
 * keep the existing URL and custom-scheme fixtures. iOS still needs the
 * production site's apple-app-site-association file before Universal Links work.
 */
export function buildEnrollUrl(
  token: string,
  profile: BackendProfile = config.backendProfile,
): string {
  const origin = profile === 'dutygraph-production'
    ? 'https://dutygraph.com'
    : ENROLL_ORIGIN;
  return `${origin}/mobile/enroll?t=${encodeURIComponent(token)}`;
}

/** Only https DutyGraph links may be handed to the system browser. */
export function isSafeBrowserUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || (u.protocol === 'http:' && u.hostname === 'localhost');
  } catch {
    return false;
  }
}

function fallbackMessage(e: unknown): string {
  if (e instanceof CompanionApiError) {
    if (e.status === 0) return "You're offline. Connect to the internet and try again.";
    return e.message;
  }
  return 'Something went wrong. Please try again.';
}
