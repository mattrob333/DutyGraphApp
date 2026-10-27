import React, { useCallback, useEffect, useRef } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ErrorState, LoadingState } from '@/components/common';
import { useStartConversation } from '@/hooks/queries';
import { reviewHref } from '@/features/conversation/routes';

/** "Confirm what we understood": starts (or resumes) the confirmation session and opens its review. */
export default function ConfirmationRoute() {
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  const start = useStartConversation();
  const started = useRef(false);

  const begin = useCallback(() => {
    start.mutate(
      { requestId, mode: 'CONFIRMATION' },
      { onSuccess: (session) => router.replace(reviewHref(session)) },
    );
  }, [requestId, start]);

  useEffect(() => {
    if (started.current || !requestId) return;
    started.current = true;
    begin();
  }, [requestId, begin]);

  if (start.isError) {
    return (
      <ErrorState
        error={start.error}
        onRetry={() => {
          start.reset();
          begin();
        }}
      />
    );
  }
  return <LoadingState label="Opening what we understood…" />;
}
