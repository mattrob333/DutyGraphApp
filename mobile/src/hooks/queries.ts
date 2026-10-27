/**
 * TanStack Query hooks. Screens import these, never the repository directly
 * for reads, so caching, refetch and offline behavior stay consistent.
 *
 * Mutations that complete work (submit, complete commitment, clarification)
 * invalidate Today, Work and Meetings because the server decides what those
 * lists contain next.
 */
import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRepository } from '@/api';
import type {
  ChangeKind,
  ConversationMode,
  Id,
  InterpretationItem,
  NotificationPreferences,
  SubmitInput,
  TurnInput,
  VoicePreferences,
} from '@/types/domain';
import { CompanionApiError } from '@/types/domain';
import { useUiStore } from '@/state/ui';

export const qk = {
  me: ['me'] as const,
  today: ['today'] as const,
  notifications: ['notifications'] as const,
  pulse: (id: Id) => ['pulse', id] as const,
  teamStatus: (id: Id) => ['pulse', id, 'team'] as const,
  conversation: (id: Id) => ['conversation', id] as const,
  review: (id: Id) => ['conversation', id, 'review'] as const,
  meetings: ['meetings'] as const,
  meeting: (id: Id) => ['meeting', id] as const,
  brief: (id: Id) => ['meeting', id, 'brief'] as const,
  live: (id: Id) => ['meeting', id, 'live'] as const,
  work: ['work'] as const,
  commitment: (id: Id) => ['commitment', id] as const,
  clarification: (id: Id) => ['clarification', id] as const,
  changeKinds: ['changeKinds'] as const,
  discovery: (id: Id) => ['discovery', id] as const,
};

export function isNetworkError(e: unknown): boolean {
  return e instanceof CompanionApiError ? e.status === 0 : e instanceof TypeError;
}

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        // Keep the last good Today/Work data visible while offline (PRD 27).
        gcTime: 24 * 60 * 60 * 1000,
        retry: (count, e) => {
          if (e instanceof CompanionApiError && !e.retryable) return false;
          return count < 2;
        },
      },
      mutations: { retry: false },
    },
  });
}

/** Wraps a repository call so network failures flip the offline banner. */
function useTracked<T>(fn: () => Promise<T>): () => Promise<T> {
  const setOffline = useUiStore((s) => s.setOffline);
  return async () => {
    try {
      const v = await fn();
      setOffline(false);
      return v;
    } catch (e) {
      if (isNetworkError(e)) setOffline(true);
      throw e;
    }
  };
}

function useInvalidateWork() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: qk.today }),
      qc.invalidateQueries({ queryKey: qk.work }),
      qc.invalidateQueries({ queryKey: qk.meetings }),
      qc.invalidateQueries({ queryKey: ['pulse'] }),
    ]);
}

// Identity --------------------------------------------------------------------

export function useMe() {
  const r = useRepository();
  return useQuery({ queryKey: qk.me, queryFn: useTracked(() => r.getMe()) });
}

export function useUpdatePreferences() {
  const r = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: { notificationPreferences?: Partial<NotificationPreferences>; voicePreferences?: Partial<VoicePreferences> }) =>
      r.updatePreferences(patch),
    onSuccess: (me) => qc.setQueryData(qk.me, me),
  });
}

// Today -----------------------------------------------------------------------

export function useToday() {
  const r = useRepository();
  return useQuery({ queryKey: qk.today, queryFn: useTracked(() => r.getToday()) });
}

export function useNotifications() {
  const r = useRepository();
  return useQuery({ queryKey: qk.notifications, queryFn: useTracked(() => r.getNotifications()) });
}

export function useMarkNotificationsRead() {
  const r = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => r.markNotificationsRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.notifications }),
  });
}

// Pulse -----------------------------------------------------------------------

export function usePulse(pulseId: Id) {
  const r = useRepository();
  return useQuery({ queryKey: qk.pulse(pulseId), queryFn: useTracked(() => r.getPulse(pulseId)), enabled: !!pulseId });
}

/** Near-real-time team completion (PRD 37.6). Polls while the screen is open. */
export function useTeamStatus(pulseId: Id) {
  const r = useRepository();
  return useQuery({
    queryKey: qk.teamStatus(pulseId),
    queryFn: useTracked(() => r.getTeamStatus(pulseId)),
    enabled: !!pulseId,
    refetchInterval: 2500,
  });
}

// Conversation ----------------------------------------------------------------

export function useStartConversation() {
  const r = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { requestId: Id; mode: ConversationMode; changeKind?: ChangeKind; clarificationOptionId?: Id }) =>
      r.startConversation(input),
    onSuccess: (s) => qc.setQueryData(qk.conversation(s.id), s),
  });
}

export function useConversation(sessionId: Id) {
  const r = useRepository();
  return useQuery({ queryKey: qk.conversation(sessionId), queryFn: useTracked(() => r.getConversation(sessionId)), enabled: !!sessionId });
}

export function useSendTurn() {
  const r = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TurnInput) => r.sendTurn(input),
    onSuccess: (res) => qc.setQueryData(qk.conversation(res.session.id), res.session),
  });
}

export function useStopConversation() {
  const r = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: Id) => r.stopConversation(sessionId),
    onSuccess: (s) => qc.setQueryData(qk.conversation(s.id), s),
  });
}

export function useReview(sessionId: Id) {
  const r = useRepository();
  return useQuery({
    queryKey: qk.review(sessionId),
    queryFn: useTracked(() => r.getReview(sessionId)),
    enabled: !!sessionId,
    // The review is edited locally; never refetch over the participant's edits.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export function useUpdateReviewItem(sessionId: Id) {
  const r = useRepository();
  return useMutation({ mutationFn: (item: InterpretationItem) => r.updateReviewItem(sessionId, item) });
}

export function useSubmitReview() {
  const r = useRepository();
  const invalidate = useInvalidateWork();
  return useMutation({
    mutationFn: (input: SubmitInput) => r.submitReview(input),
    onSuccess: () => invalidate(),
  });
}

// Meetings --------------------------------------------------------------------

export function useMeetings() {
  const r = useRepository();
  return useQuery({ queryKey: qk.meetings, queryFn: useTracked(() => r.getMeetings()) });
}

export function useMeeting(meetingId: Id) {
  const r = useRepository();
  return useQuery({ queryKey: qk.meeting(meetingId), queryFn: useTracked(() => r.getMeeting(meetingId)), enabled: !!meetingId });
}

export function useMeetingBrief(meetingId: Id) {
  const r = useRepository();
  return useQuery({ queryKey: qk.brief(meetingId), queryFn: useTracked(() => r.getMeetingBrief(meetingId)), enabled: !!meetingId });
}

export function useLiveMeeting(meetingId: Id) {
  const r = useRepository();
  return useQuery({
    queryKey: qk.live(meetingId),
    queryFn: useTracked(() => r.getLiveMeeting(meetingId)),
    enabled: !!meetingId,
    refetchInterval: 5000,
  });
}

export function useStartWrapUp() {
  const r = useRepository();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (meetingId: Id) => r.startWrapUp(meetingId),
    onSuccess: (s) => qc.setQueryData(qk.conversation(s.id), s),
  });
}

// Work ------------------------------------------------------------------------

export function useWork() {
  const r = useRepository();
  return useQuery({ queryKey: qk.work, queryFn: useTracked(() => r.getWork()) });
}

export function useCommitment(commitmentId: Id) {
  const r = useRepository();
  return useQuery({ queryKey: qk.commitment(commitmentId), queryFn: useTracked(() => r.getCommitment(commitmentId)), enabled: !!commitmentId });
}

export function useCompleteCommitment() {
  const r = useRepository();
  const qc = useQueryClient();
  const invalidate = useInvalidateWork();
  return useMutation({
    mutationFn: ({ commitmentId, idempotencyKey }: { commitmentId: Id; idempotencyKey: string }) =>
      r.completeCommitment(commitmentId, idempotencyKey),
    onSuccess: (c) => {
      qc.setQueryData(qk.commitment(c.id), c);
      return invalidate();
    },
  });
}

// Continuous discovery --------------------------------------------------------

export function useClarification(id: Id) {
  const r = useRepository();
  return useQuery({ queryKey: qk.clarification(id), queryFn: useTracked(() => r.getClarification(id)), enabled: !!id });
}

export function useRespondToClarification() {
  const r = useRepository();
  const qc = useQueryClient();
  const invalidate = useInvalidateWork();
  return useMutation({
    mutationFn: ({ clarificationId, optionId, idempotencyKey }: { clarificationId: Id; optionId: Id; idempotencyKey: string }) =>
      r.respondToClarification(clarificationId, optionId, idempotencyKey),
    onSuccess: (_res, v) => {
      qc.invalidateQueries({ queryKey: qk.clarification(v.clarificationId) });
      return invalidate();
    },
  });
}

export function useChangeKinds() {
  const r = useRepository();
  return useQuery({ queryKey: qk.changeKinds, queryFn: () => r.getChangeKinds(), staleTime: Infinity });
}

export function useCreateChangeReport() {
  const r = useRepository();
  return useMutation({ mutationFn: (kind: ChangeKind) => r.createChangeReport(kind) });
}

export function useDiscoveryRequest(requestId: Id) {
  const r = useRepository();
  return useQuery({ queryKey: qk.discovery(requestId), queryFn: useTracked(() => r.getDiscoveryRequest(requestId)), enabled: !!requestId });
}
