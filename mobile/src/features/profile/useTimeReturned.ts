import { useRepository } from '@/api';

export interface TimeReturned {
  totalMinutes: number;
  items: { label: string; count: number }[];
}

/**
 * Personal time returned this month (PRD 29: the participant's own time only,
 * never company cost analytics).
 *
 * The domain model and contract 1.1 have no field for this yet. Until the
 * server adds one, the mock returns fixture numbers and the HTTP source
 * returns null so the card is hidden rather than invented.
 */
const MOCK: TimeReturned = {
  totalMinutes: 225,
  items: [
    { label: 'Status meetings replaced', count: 3 },
    { label: 'Project check-ins shortened', count: 2 },
    { label: 'Reviews handled async', count: 1 },
  ],
};

export function useTimeReturned(): TimeReturned | null {
  const r = useRepository();
  return r.kind === 'mock' ? MOCK : null;
}
