/**
 * The Companion scope switch (docs/specs/COMPANION-HANDS-FREE.md §6.1), set at build time with
 * EXPO_PUBLIC_COMPANION_SCOPE:
 *
 * - `questions` (default): the app mirrors the web team page. Tabs are Today and Me; Today lists
 *   question requests and task checks only. Pulse, meetings, commitments and Something changed
 *   stay in the code but are hidden from navigation until their server side exists.
 * - `full`: PR #48's app with all four tabs.
 *
 * Read through `companionScope()` so tests can switch it by setting `config.companionScope`.
 */
import { config, type CompanionScope } from '@/api/config';
import type { ParticipationRequest } from '@/types/domain';

export type { CompanionScope };

export const companionScope = (): CompanionScope => config.companionScope;

export const isFullScope = () => companionScope() === 'full';

const ALL_TABS = ['today', 'work', 'meetings', 'me'] as const;
export type TabName = (typeof ALL_TABS)[number];

/** The bottom tabs for a scope, in order. */
export function visibleTabs(scope: CompanionScope = companionScope()): TabName[] {
  return scope === 'full' ? [...ALL_TABS] : ['today', 'me'];
}

/** Routes the `questions` scope opens: question cards, the old discovery link (redirects) and task checks. */
const QUESTION_ROUTES = ['/questions/', '/discovery/', '/confirmations/'];

/** True when Today shows this request in the given scope. */
export function requestInScope(r: Pick<ParticipationRequest, 'route'>, scope: CompanionScope = companionScope()): boolean {
  if (scope === 'full') return true;
  return QUESTION_ROUTES.some((p) => r.route.startsWith(p));
}
