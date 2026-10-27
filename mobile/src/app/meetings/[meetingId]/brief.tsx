import React, { useEffect } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { BottomActionBar, Button, ErrorState, LoadingState, Screen, Text } from '@/components/common';
import { ListCard } from '@/components/meetings/ListCard';
import { minutesLabel } from '@/features/meetings/format';
import { useJoinMeeting } from '@/features/meetings/useJoinMeeting';
import { track } from '@/analytics/events';
import { useMeetingBrief } from '@/hooks/queries';

function Field({ label, children, big }: { label: string; children: string; big?: boolean }) {
  return (
    <>
      <Text variant="label" color="faint" style={{ marginBottom: 6 }}>
        {label}
      </Text>
      <Text variant={big ? 'cardTitle' : 'body'} style={big ? { fontFamily: 'DMSans_500Medium', lineHeight: 25, marginBottom: 18 } : { lineHeight: 24, marginBottom: 22 }}>
        {children}
      </Text>
    </>
  );
}

export default function MeetingBriefScreen() {
  const { meetingId } = useLocalSearchParams<{ meetingId: string }>();
  const q = useMeetingBrief(meetingId);
  const { join, joining } = useJoinMeeting(meetingId, q.data?.joinTarget);
  const loaded = !!q.data;
  useEffect(() => {
    if (loaded) track('premeeting_brief_viewed', { meetingId });
  }, [loaded, meetingId]);

  if (q.isPending) return <LoadingState />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const b = q.data;
  return (
    <Screen
      contentContainerStyle={{ paddingTop: 24 }}
      footer={
        <BottomActionBar>
          <Button kind="primary" label="I'm ready" loading={joining} disabled={!b.joinTarget} onPress={join} />
        </BottomActionBar>
      }
    >
      <Text variant="label" color="faint">
        {b.title} · {b.whenLabel}
      </Text>
      <Text variant="display" accessibilityRole="header" style={{ marginTop: 10, marginBottom: 20 }}>
        Before you join
      </Text>
      <Field label="Purpose" big>
        {b.purpose}
      </Field>
      <Field label="Your role">{b.whyYou}</Field>
      {b.alreadyKnown.length ? <ListCard title="What DutyGraph already knows" items={b.alreadyKnown} bulletTones /> : null}
      {b.mayAskYou.length ? <ListCard title="We may need you to answer" items={b.mayAskYou} numbered level="raised" /> : null}
      {b.openQuestions.length ? <ListCard title="Still open" items={b.openQuestions} /> : null}
      {b.expectedOutcome ? <ListCard title="Expected outcome" items={[b.expectedOutcome]} /> : null}
      {b.decisionAuthority ? <ListCard title="Who decides" items={[b.decisionAuthority]} /> : null}
      <Text variant="meta" color="muted" style={{ marginTop: 2 }}>
        Estimated time: {minutesLabel(b.durationMinutes)}
      </Text>
    </Screen>
  );
}
