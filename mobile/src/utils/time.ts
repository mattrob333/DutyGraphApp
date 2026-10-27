/**
 * Deterministic date logic (PRD 10.2: never delegated to a model).
 * All functions take `now` explicitly so they are testable and so screens can
 * use the server's `asOf` clock when it is available.
 */
import type { Urgency } from '@/types/domain';

const DUE_SOON_MS = 2 * 60 * 60 * 1000;

export function urgencyFor(dueAt: string | undefined, now: Date, complete = false): Urgency {
  if (!dueAt || complete) return 'NONE';
  const due = new Date(dueAt).getTime();
  const t = now.getTime();
  if (Number.isNaN(due)) return 'NONE';
  if (due < t) return 'OVERDUE';
  if (isSameDay(new Date(due), now)) return due - t <= DUE_SOON_MS ? 'DUE_SOON' : 'DUE';
  return 'NONE';
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function formatClock(d: Date): string {
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
}

/** Compact clock for headlines: "11:00" or "2:00". */
export function formatShortClock(d: Date): string {
  const h = d.getHours() % 12 || 12;
  return `${h}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function formatWeekday(d: Date): string {
  return WEEKDAYS[d.getDay()];
}

/** "Monday, 28 September" (prototype format). */
export function formatLongDate(d: Date): string {
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** Chip copy for a due time: "Due 10:30 AM", "Overdue", "Due Thursday". */
export function dueChipLabel(dueAt: string | undefined, now: Date, complete = false): string | undefined {
  if (!dueAt) return undefined;
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return undefined;
  const u = urgencyFor(dueAt, now, complete);
  if (u === 'OVERDUE') return 'Overdue';
  if (isSameDay(due, now)) return `Due ${formatClock(due)}`;
  const days = Math.round((startOfDay(due).getTime() - startOfDay(now).getTime()) / 86_400_000);
  if (days === 1) return 'Due tomorrow';
  if (days > 1 && days < 7) return `Due ${formatWeekday(due)}`;
  return `Due ${due.getDate()} ${MONTHS[due.getMonth()]}`;
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/** mm:ss for recording timers. */
export function formatElapsed(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Returns a Date for today at hh:mm local, offset by `dayOffset` days. */
export function atLocal(hours: number, minutes: number, dayOffset = 0, base = new Date()): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hours, minutes, 0, 0);
  return d;
}
