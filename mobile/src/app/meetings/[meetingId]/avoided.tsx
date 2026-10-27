import React, { useEffect } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { BottomActionBar, Button, ErrorState, LoadingState, Screen, Text } from '@/components/common';
import { MeetingHero } from '@/components/meetings/MeetingHero';
import { meetingKicker } from '@/features/meetings/format';
import { track } from '@/analytics/events';
import { useMeeting } from '@/hooks/queries';
import { openSheet } from '@/state/ui';
import { radius, useColors } from '@/theme';

export default function MeetingAvoidedScreen() {
  const { meetingId } = useLocalSearchParams<{ meetingId: string }>();
  const q = useMeeting(meetingId);
  const c = useColors();
  const loaded = !!q.data;
  useEffect(() => {
    if (loaded) track('meeting_avoided_viewed', { meetingId });
  }, [loaded, meetingId]);

  if (q.isPending) return <LoadingState />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const m = q.data;
  return (
    <Screen
      contentContainerStyle={{ paddingTop: 32 }}
      footer={
        <BottomActionBar>
          {m.summary?.length ? <Button kind="primary" label="See team summary" onPress={() => openSheet({ title: 'Team summary', paragraphs: m.summary ?? [] })} /> : null}
          <Button kind="secondary" label="Back to Today" full onPress={() => router.replace('/today')} />
        </BottomActionBar>
      }
    >
      <MeetingHero kicker={meetingKicker(m.startsAt, m.title)} headline={m.headline} reason={m.reason} />
      {m.minutesReturned != null ? (
        <View
          accessible
          accessibilityLabel={`Time returned to you: ${m.minutesReturned} minutes`}
          style={{ backgroundColor: c.sageBg, borderWidth: 1, borderColor: c.line, borderRadius: radius.card, paddingVertical: 20, paddingHorizontal: 18 }}
        >
          <Text variant="label" color="sage" style={{ fontSize: 13, letterSpacing: 1 }}>
            Time returned to you
          </Text>
          <Text variant="display" style={{ fontSize: 44, lineHeight: 48, letterSpacing: -1.4, marginTop: 6 }}>
            {m.minutesReturned} min
          </Text>
        </View>
      ) : null}
    </Screen>
  );
}
