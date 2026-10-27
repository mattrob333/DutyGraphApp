/**
 * Reads for the hands-free question cards. The question set is cached for the whole run, so the
 * deck keeps working when the connection drops after the intro.
 */
import { useQuery } from '@tanstack/react-query';
import { useRepository } from '@/api';
import { isNetworkError } from '@/hooks/queries';
import { useUiStore } from '@/state/ui';
import type { Id } from '@/types/domain';

export const hfKeys = {
  questionSet: (requestId: Id) => ['questions', requestId] as const,
};

export function useQuestionSet(requestId: Id) {
  const repo = useRepository();
  const setOffline = useUiStore((s) => s.setOffline);
  return useQuery({
    queryKey: hfKeys.questionSet(requestId),
    queryFn: async () => {
      try {
        const set = await repo.getQuestionSet(requestId);
        setOffline(false);
        return set;
      } catch (e) {
        if (isNetworkError(e)) setOffline(true);
        throw e;
      }
    },
    enabled: !!requestId,
    staleTime: 10 * 60 * 1000,
  });
}
