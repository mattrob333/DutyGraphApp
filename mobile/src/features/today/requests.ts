/**
 * Today inbox helpers: labels, chip tone and what tapping a card does.
 * Pure where possible so the rules are unit tested.
 */
import type { Href } from 'expo-router';
import { router } from 'expo-router';
import { openSheet } from '@/state/ui';
import { track } from '@/analytics/events';
import { dueChipLabel, urgencyFor } from '@/utils/time';
import type { ParticipationRequest, RequestType } from '@/types/domain';
import type { Tone } from '@/theme';
import { companionScope, requestInScope, type CompanionScope } from './scope';

export const REQUEST_TYPE_LABEL: Record<RequestType, string> = {
  PULSE: 'Pulse',
  DISCOVERY: 'Discovery',
  CONFIRMATION: 'Confirmation',
  DECISION: 'Decision',
  APPROVAL: 'Approval',
  CLARIFICATION: 'Clarification',
  MEETING: 'Meeting',
};

export interface DueChip {
  label: string;
  tone: Tone;
}

/** Factual due chip: amber when due today, red when overdue, plain otherwise. */
export function dueChipFor(r: Pick<ParticipationRequest, 'dueAt' | 'status'>, now: Date): DueChip | undefined {
  const complete = r.status === 'COMPLETE';
  const label = dueChipLabel(r.dueAt, now, complete);
  if (!label || complete) return undefined;
  const u = urgencyFor(r.dueAt, now, complete);
  return { label, tone: u === 'OVERDUE' ? 'red' : u === 'DUE' || u === 'DUE_SOON' ? 'amber' : 'plain' };
}

/**
 * The full-width primary button: the first due-now Pulse (prototype), or with the `questions`
 * scope the first due-now question request.
 */
export function primaryRequestId(dueNow: ParticipationRequest[], scope: CompanionScope = companionScope()): string | undefined {
  if (scope === 'questions') return dueNow.find((r) => r.route.startsWith('/questions/'))?.id;
  return dueNow.find((r) => r.type === 'PULSE')?.id;
}

/** Today in a scope: only the requests that scope opens. */
export function scopedFeed<T extends { dueNow: ParticipationRequest[]; later: ParticipationRequest[] }>(feed: T, scope: CompanionScope = companionScope()): T {
  if (scope === 'full') return feed;
  return { ...feed, dueNow: feed.dueNow.filter((r) => requestInScope(r, scope)), later: feed.later.filter((r) => requestInScope(r, scope)) };
}

/**
 * Opens a request. A request with a route navigates there; one without
 * (a Decision that only gives context) opens the plain-language sheet.
 */
export function openRequest(r: ParticipationRequest): 'route' | 'sheet' {
  track('request_viewed', { requestId: r.id, type: r.type });
  if (r.route) {
    router.push(r.route as Href);
    return 'route';
  }
  openSheet({ title: r.title, paragraphs: [r.summary, r.reason].filter(Boolean) });
  return 'sheet';
}
