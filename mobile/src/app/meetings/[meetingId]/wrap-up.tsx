import React, { useEffect, useRef } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ErrorState, LoadingState } from '@/components/common';
import { reviewHref } from '@/features/conversation/routes';
import { useStartWrapUp } from '@/hooks/queries';

/** Starts the meeting wrap-up conversation and hands off to the shared review screen. */
export default function MeetingWrapUpScreen() {
  const { meetingId } = useLocalSearchParams<{ meetingId: string }>();
  const wrap = useStartWrapUp();
  const started = useRef(false);

  const start = React.useCallback(() => {
    wrap
      .mutateAsync(meetingId)
      .then((session) => router.replace(reviewHref(session)))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId]);

  useEffect(() => {
    if (started.current || !meetingId) return;
    started.current = true;
    start();
  }, [meetingId, start]);

  if (wrap.isError) return <ErrorState error={wrap.error} onRetry={start} />;
  return <LoadingState label="Preparing the meeting outcome…" />;
}
