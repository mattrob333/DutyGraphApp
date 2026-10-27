import React from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { BottomActionBar, Button, ErrorState, LoadingState, Screen, StatusChip } from '@/components/common';
import { FactList, type Fact } from '@/components/meetings/FactList';
import { MeetingHero } from '@/components/meetings/MeetingHero';
import { meetingClock, minutesLabel } from '@/features/meetings/format';
import { useJoinMeeting } from '@/features/meetings/useJoinMeeting';
import { useMeeting } from '@/hooks/queries';
import { View } from 'react-native';

export default function MeetingRequiredScreen() {
  const { meetingId } = useLocalSearchParams<{ meetingId: string }>();
  const q = useMeeting(meetingId);
  const { join, joining } = useJoinMeeting(meetingId, q.data?.joinTarget);

  if (q.isPending) return <LoadingState />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const m = q.data;
  const clock = meetingClock(m.startsAt);
  const facts: Fact[] = [];
  if (m.whyYou) facts.push({ label: "Why you're needed", value: m.whyYou });
  if (m.yourRole) facts.push({ label: 'Your role', value: m.yourRole });
  if (m.expectedOutcome) facts.push({ label: 'Expected outcome', value: m.expectedOutcome });
  const minutes = m.newDurationMinutes ?? m.originalDurationMinutes;
  if (minutes != null) facts.push({ label: 'Estimated time', value: minutesLabel(minutes), inline: true });
  return (
    <Screen
      contentContainerStyle={{ paddingTop: 28 }}
      footer={
        <BottomActionBar>
          <Button kind="primary" label="Join meeting" loading={joining} disabled={!m.joinTarget} onPress={join} />
          {m.hasBrief ? <Button kind="secondary" full label="Review context" onPress={() => router.push({ pathname: '/meetings/[meetingId]/brief', params: { meetingId } })} /> : null}
        </BottomActionBar>
      }
    >
      {clock ? (
        <View style={{ marginBottom: 12 }}>
          <StatusChip tone="amber" label={`Today · ${clock}`} />
        </View>
      ) : null}
      <MeetingHero headline={m.headline} subtitle={m.title} reason={m.reason} />
      {facts.length ? <FactList facts={facts} /> : null}
    </Screen>
  );
}
