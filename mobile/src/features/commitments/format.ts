import type { Commitment, WorkList } from '@/types/domain';

/** "Due today · 4:00 PM" -> "Today · 4:00 PM" for the detail row; other labels pass through. */
export function detailDue(label: string): string {
  const stripped = label.replace(/^Due\s+/i, '');
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

export interface FieldRow {
  label: string;
  value: string;
}

function present(rows: { label: string; value?: string }[]): FieldRow[] {
  return rows.filter((r): r is FieldRow => !!r.value && r.value.trim().length > 0);
}

/** Commitment detail rows. Only fields the server provided are shown. */
export function commitmentRows(c: Commitment): FieldRow[] {
  return present([
    { label: 'Outcome', value: c.outcome },
    { label: 'Due', value: c.dueLabel ? detailDue(c.dueLabel) : undefined },
    { label: 'Why', value: c.why },
    { label: 'Authority', value: c.authority },
    { label: 'Constraints', value: c.constraints },
    { label: 'Definition of done', value: c.definitionOfDone },
    { label: 'Source', value: c.sourceLabel },
  ]);
}

/** Waiting-on detail rows: no chase actions, just facts. */
export function waitingRows(c: Commitment): FieldRow[] {
  const owner = c.waitingOn ? [c.waitingOn.displayName, c.waitingOn.team].filter(Boolean).join(', ') : undefined;
  return present([
    { label: 'Owner', value: owner },
    { label: 'Needed for', value: c.outcome },
    { label: 'Latest', value: c.latest },
    { label: 'What happens next', value: c.whatHappensNext },
  ]);
}

export function commitmentHref(c: Pick<Commitment, 'id' | 'kind'>) {
  return c.kind === 'WAITING_ON'
    ? ({ pathname: '/work/waiting/[dependencyId]', params: { dependencyId: c.id } } as const)
    : ({ pathname: '/work/commitments/[commitmentId]', params: { commitmentId: c.id } } as const);
}

export function isWorkEmpty(w: WorkList): boolean {
  return !w.today.length && !w.thisWeek.length && !w.later.length && !w.waiting.length && !w.done.length;
}
