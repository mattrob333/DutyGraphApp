import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));

import { dueChipFor, openRequest, primaryRequestId, scopedFeed } from '../requests';
import { useUiStore } from '@/state/ui';
import type { ParticipationRequest } from '@/types/domain';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const NOW = new Date(2026, 8, 28, 9, 0);
const req = (o: Partial<ParticipationRequest>): ParticipationRequest => ({
  id: 'r1',
  type: 'PULSE',
  title: 'Monday Pulse',
  summary: '4 questions',
  reason: 'Because.',
  status: 'NOT_STARTED',
  cta: 'Start',
  route: '/pulse/p1',
  createdAt: NOW.toISOString(),
  ...o,
});

describe('dueChipFor', () => {
  it('is amber when due today and red when overdue', () => {
    expect(dueChipFor(req({ dueAt: new Date(2026, 8, 28, 10, 30).toISOString() }), NOW)).toEqual({ label: 'Due 10:30 AM', tone: 'amber' });
    expect(dueChipFor(req({ dueAt: new Date(2026, 8, 28, 8, 30).toISOString() }), NOW)).toEqual({ label: 'Overdue', tone: 'red' });
  });
  it('is plain for a later day and absent without a due time or when complete', () => {
    expect(dueChipFor(req({ dueAt: new Date(2026, 8, 30, 17).toISOString() }), NOW)?.tone).toBe('plain');
    expect(dueChipFor(req({}), NOW)).toBeUndefined();
    expect(dueChipFor(req({ dueAt: new Date(2026, 8, 28, 8, 30).toISOString(), status: 'COMPLETE' }), NOW)).toBeUndefined();
  });
});

describe('primaryRequestId', () => {
  it('picks the first Pulse only with the full app', () => {
    const list = [req({ id: 'a', type: 'CONFIRMATION' }), req({ id: 'b' }), req({ id: 'c' })];
    expect(primaryRequestId(list, 'full')).toBe('b');
    expect(primaryRequestId([req({ id: 'a', type: 'CLARIFICATION' })], 'full')).toBeUndefined();
  });

  it('picks the first question request with the questions scope', () => {
    const list = [req({ id: 'a', type: 'CONFIRMATION', route: '/confirmations/a' }), req({ id: 'b', type: 'DISCOVERY', route: '/questions/b' }), req({ id: 'c' })];
    expect(primaryRequestId(list, 'questions')).toBe('b');
    expect(primaryRequestId([req({ id: 'c' })], 'questions')).toBeUndefined();
  });
});

describe('scopedFeed', () => {
  const feed = {
    dueNow: [req({ id: 'pulse', route: '/pulse/p1' }), req({ id: 'q', type: 'DISCOVERY', route: '/questions/q' }), req({ id: 'check', type: 'CONFIRMATION', route: '/confirmations/check' })],
    later: [req({ id: 'old', type: 'DISCOVERY', route: '/discovery/old' }), req({ id: 'meeting', type: 'MEETING', route: '/meetings/m/shortened' }), req({ id: 'decision', type: 'DECISION', route: '' })],
  };

  it('keeps question requests and task checks only with the questions scope', () => {
    const s = scopedFeed(feed, 'questions');
    expect(s.dueNow.map((r) => r.id)).toEqual(['q', 'check']);
    expect(s.later.map((r) => r.id)).toEqual(['old']);
  });

  it('keeps everything with the full app', () => {
    expect(scopedFeed(feed, 'full')).toBe(feed);
  });
});

describe('openRequest', () => {
  beforeEach(() => {
    mockPush.mockClear();
    useUiStore.setState({ sheet: null });
  });
  it('navigates to the route', () => {
    expect(openRequest(req({}))).toBe('route');
    expect(mockPush).toHaveBeenCalledWith('/pulse/p1');
    expect(useUiStore.getState().sheet).toBeNull();
  });
  it('opens the context sheet for a routeless decision', () => {
    expect(openRequest(req({ type: 'DECISION', route: '', title: 'Vendor decision', summary: 'You may be needed.', reason: 'Why.' }))).toBe('sheet');
    expect(mockPush).not.toHaveBeenCalled();
    expect(useUiStore.getState().sheet).toEqual({ title: 'Vendor decision', paragraphs: ['You may be needed.', 'Why.'] });
  });
});
