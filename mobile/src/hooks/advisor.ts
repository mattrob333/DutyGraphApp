import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAdvisorRepository, type AdvisorRepository } from "@/api/advisor";
import { useAdvisorStore } from "@/state/advisor";
function useScope() {
  return useAdvisorStore((s) =>
    s.identity
      ? `${s.identity.company.id}:${s.identity.advisor.id}`
      : "unpaired",
  );
}
export function useAdvisorMeetings() {
  const scope = useScope();
  return useQuery({
    queryKey: ["advisor", scope, "meetings"],
    queryFn: () => getAdvisorRepository().meetings(),
  });
}
export function useAdvisorPeople() {
  const scope = useScope();
  return useQuery({
    queryKey: ["advisor", scope, "people"],
    queryFn: () => getAdvisorRepository().people(),
  });
}
export function useAdvisorMeeting(id: string) {
  const scope = useScope();
  return useQuery({
    queryKey: ["advisor", scope, "meeting", id],
    queryFn: () => getAdvisorRepository().meeting(id),
    enabled: !!id,
  });
}
export function useAdvisorSession(id: string) {
  const scope = useScope();
  return useQuery({
    queryKey: ["advisor", scope, "session", id],
    queryFn: () => getAdvisorRepository().session(id),
    enabled: !!id,
  });
}
export function useAdvisorPulse(id: string) {
  const scope = useScope();
  return useQuery({
    queryKey: ["advisor", scope, "pulse", id],
    queryFn: () => getAdvisorRepository().pulse(id),
    refetchInterval: 15000,
  });
}
export function useAdvisorCommand<T>(
  operation: (repo: AdvisorRepository) => Promise<T>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => operation(getAdvisorRepository()),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["advisor"] });
    },
  });
}
