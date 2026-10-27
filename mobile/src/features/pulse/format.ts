/** Pulse screen copy and factual status mapping (PRD 8; no ranking, no scores). */
import { formatClock } from '@/utils/time';
import type { Pulse, PulseParticipantStatus } from '@/types/domain';
import type { TextColor } from '@/components/common';

export interface StatusLabel {
  label: string;
  color: TextColor;
}

/** Completion metadata only. Colors carry factual meaning (sage done, amber due, red overdue). */
export function participantStatusLabel(status: PulseParticipantStatus, dueAt?: string): StatusLabel {
  switch (status) {
    case 'COMPLETE':
      return { label: 'Complete', color: 'sage' };
    case 'IN_PROGRESS':
      return { label: 'In progress', color: 'muted' };
    case 'DUE_SOON':
      return { label: dueAt && !Number.isNaN(new Date(dueAt).getTime()) ? `Due ${formatClock(new Date(dueAt))}` : 'Due', color: 'amber' };
    case 'OVERDUE':
      return { label: 'Overdue', color: 'red' };
    default:
      return { label: 'Not started', color: 'muted' };
  }
}

export function pulseKicker(pulse: Pick<Pulse, 'dueAt'>): string {
  return `Pulse · due ${formatClock(new Date(pulse.dueAt))}`;
}

/** "Instead of the 60-minute status meeting, DutyGraph is collecting everyone's update individually." */
export function replacesMeetingLine(pulse: Pick<Pulse, 'replacesMeeting'>): string | undefined {
  const m = pulse.replacesMeeting;
  if (!m) return undefined;
  return `Instead of the ${m.durationMinutes}-minute ${m.title}, DutyGraph is collecting everyone's update individually.`;
}

/** Topics for the "will cover" card: fixture topics only when supplied, otherwise a factual count. */
export function coverageRows(pulse: Pick<Pulse, 'questionCount'>, topics?: readonly string[]): { numbered: boolean; rows: string[] } {
  if (topics && topics.length > 0) return { numbered: true, rows: [...topics] };
  return { numbered: false, rows: [`${pulse.questionCount} ${pulse.questionCount === 1 ? 'question' : 'questions'}`] };
}

export function progressFraction(complete: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, complete / total));
}
