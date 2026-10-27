/**
 * Copy helpers for the hands-free question cards (docs/specs/COMPANION-HANDS-FREE.md §6). Pure, so
 * the wording is unit tested. Plain words only: no scores, percentages or AI terms.
 */
import type { QuestionSet } from '@/types/handsfree';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Alex Rivera", or "your advisor" when the server sent no name. */
export const advisorName = (set: Pick<QuestionSet, 'advisorName'>) => set.advisorName.trim() || 'your advisor';

/** "Alex", or "your advisor". */
export const advisorFirst = (set: Pick<QuestionSet, 'advisorName'>) => set.advisorName.trim().split(/\s+/)[0] || 'your advisor';

/** The advisor's questions only (the "Anything else?" card is not counted). */
export const questionCount = (set: Pick<QuestionSet, 'questions'>) => set.questions.filter((q) => !q.isElse).length;

/** "6 quick questions about your work". */
export function introTitle(count: number) {
  return `${count} quick ${count === 1 ? 'question' : 'questions'} about your work`;
}

/** "About 3 minutes". */
export function minutesLabel(minutes: number) {
  const m = Math.max(1, Math.round(minutes));
  return `About ${m} ${m === 1 ? 'minute' : 'minutes'}`;
}

/** "Due Fri", "Due today", "Due tomorrow", "Due 9 Oct", or "" without a date. `dueDate` is YYYY-MM-DD. */
export function dueShort(dueDate: string, now: Date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dueDate);
  if (!m) return '';
  const due = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return 'Past due';
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days < 7) return `Due ${DAYS[due.getDay()]}`;
  return `Due ${due.getDate()} ${MONTHS[due.getMonth()]}`;
}

/** "Questions from Alex Rivera · Due Fri". */
export function introEyebrow(set: Pick<QuestionSet, 'advisorName' | 'dueDate'>, now: Date) {
  const due = dueShort(set.dueDate, now);
  return [`Questions from ${advisorName(set)}`, due].filter(Boolean).join(' · ');
}

/** "That took about 2 minutes." from the time the cards started. */
export function tookLabel(ms: number) {
  const m = Math.max(1, Math.round(ms / 60_000));
  return `That took about ${m} ${m === 1 ? 'minute' : 'minutes'}.`;
}

/** The caption shows the last words only: "…for the emailed orders, the order system…" (prototype: 16 words). */
export function captionTail(text: string, words = 16) {
  const w = text.trim().split(/\s+/).filter(Boolean);
  return w.length > words ? `…${w.slice(-words).join(' ')}` : w.join(' ');
}

/** "You said: …" on a past card, clipped like the prototype (170 characters). */
export function youSaid(raw: string) {
  const t = raw.trim();
  if (!t) return 'Nothing yet.';
  return t.length > 170 ? `${t.slice(0, 168)}…` : t;
}

/** "Send to Alex", or "Send" without a name. */
export function sendLabel(set: Pick<QuestionSet, 'advisorName'>) {
  const first = set.advisorName.trim().split(/\s+/)[0];
  return first ? `Send to ${first}` : 'Send';
}
