/**
 * Deterministic meeting display logic (PRD 10.2: times are never model output).
 * Every function takes its clock explicitly so it is testable.
 */
import type { MeetingJoinTarget, MeetingSummary } from '@/types/domain';

function clockParts(d: Date): { time: string; meridiem: 'AM' | 'PM' } {
  const h = d.getHours();
  return { time: `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}`, meridiem: h >= 12 ? 'PM' : 'AM' };
}

/** "2:00–2:15 PM", or "11:45 AM–12:15 PM" when the window crosses noon/midnight. */
export function formatWindow(start: Date, end: Date): string {
  const a = clockParts(start);
  const b = clockParts(end);
  return a.meridiem === b.meridiem ? `${a.time}–${b.time} ${b.meridiem}` : `${a.time} ${a.meridiem}–${b.time} ${b.meridiem}`;
}

export interface MeetingWindows {
  /** Current window, e.g. "2:00–2:15 PM". */
  current?: string;
  /** Original window, e.g. "2:00–3:00 PM". */
  original?: string;
}

export function meetingWindows(input: {
  startsAt?: string;
  endsAt?: string;
  originalDurationMinutes?: number;
  newDurationMinutes?: number;
}): MeetingWindows {
  if (!input.startsAt) return {};
  const start = new Date(input.startsAt);
  if (Number.isNaN(start.getTime())) return {};
  const out: MeetingWindows = {};
  let end: Date | undefined;
  if (input.endsAt) end = new Date(input.endsAt);
  else if (input.newDurationMinutes != null) end = new Date(start.getTime() + input.newDurationMinutes * 60_000);
  if (end && !Number.isNaN(end.getTime())) out.current = formatWindow(start, end);
  if (input.originalDurationMinutes != null) {
    out.original = formatWindow(start, new Date(start.getTime() + input.originalDurationMinutes * 60_000));
  }
  return out;
}

/** "11:00 · Operations status meeting" (compact clock, no meridiem, as in the prototype). */
export function meetingKicker(startsAt: string | undefined, title: string): string {
  if (!startsAt) return title;
  const d = new Date(startsAt);
  if (Number.isNaN(d.getTime())) return title;
  return `${clockParts(d).time} · ${title}`;
}

/** "2:00 PM" for chips and briefs. */
export function meetingClock(startsAt: string | undefined): string | undefined {
  if (!startsAt) return undefined;
  const d = new Date(startsAt);
  if (Number.isNaN(d.getTime())) return undefined;
  const p = clockParts(d);
  return `${p.time} ${p.meridiem}`;
}

export function minutesLabel(minutes: number): string {
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

/** Remaining time as m:ss (h:mm:ss over an hour). Never negative. */
export function formatRemaining(endsAt: string, now: number): string {
  const end = new Date(endsAt).getTime();
  if (Number.isNaN(end)) return '--:--';
  const total = Math.max(0, Math.ceil((end - now) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export const MEETING_GROUP_ORDER: { key: MeetingSummary['group']; label: string }[] = [
  { key: 'ASYNC', label: 'Async' },
  { key: 'TODAY', label: 'Today' },
  { key: 'UPCOMING', label: 'Upcoming' },
  { key: 'RECENT', label: 'Recent' },
];

export function groupMeetings(items: MeetingSummary[]): { key: MeetingSummary['group']; label: string; items: MeetingSummary[] }[] {
  return MEETING_GROUP_ORDER.map((g) => ({ ...g, items: items.filter((m) => m.group === g.key) })).filter((g) => g.items.length > 0);
}

/** Only https links are ever opened (PRD 12: no arbitrary schemes). */
export function isSafeJoinUrl(url: string | undefined): url is string {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && !!u.hostname;
  } catch {
    return false;
  }
}

export function providerName(p: MeetingJoinTarget['provider']): string {
  switch (p) {
    case 'GOOGLE_MEET':
      return 'Google Meet';
    case 'TEAMS':
      return 'Microsoft Teams';
    case 'ZOOM':
      return 'Zoom';
    case 'PHONE':
      return 'the call';
    case 'IN_PERSON':
      return 'the room';
    default:
      return 'the meeting';
  }
}
