import React, { useEffect } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { BottomActionBar, Button, ErrorState, LoadingState, Screen, Text } from '@/components/common';
import { FactList, type Fact } from '@/components/meetings/FactList';
import { MeetingHero } from '@/components/meetings/MeetingHero';
import { meetingClock, meetingKicker, meetingWindows, minutesLabel } from '@/features/meetings/format';
import { useJoinMeeting } from '@/features/meetings/useJoinMeeting';
import { track } from '@/analytics/events';
import { useMeeting } from '@/hooks/queries';
import { radius, useColors } from '@/theme';

export default function MeetingShortenedScreen() {
  const { meetingId } = useLocalSearchParams<{ meetingId: string }>();
  const q = useMeeting(meetingId);
  const c = useColors();
  const { join, joining } = useJoinMeeting(meetingId, q.data?.joinTarget);
  const loaded = !!q.data;
  useEffect(() => {
    if (loaded) track('meeting_shortened_viewed', { meetingId });
  }, [loaded, meetingId]);

  if (q.isPending) return <LoadingState />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const m = q.data;
  const w = meetingWindows(m);
  const facts: Fact[] = [];
  if (m.issue) facts.push({ label: 'What needs you', value: m.issue });
  if (m.whyYou) facts.push({ label: "Why you're needed", value: m.whyYou });
  if (m.expectedOutcome) facts.push({ label: 'Expected outcome', value: m.expectedOutcome });
  const clock = meetingClock(m.startsAt);
  return (
    <Screen
      contentContainerStyle={{ paddingTop: 32 }}
      footer={
        <BottomActionBar>
          {m.hasBrief ? (
            <>
              <Button kind="primary" label="Read the brief" onPress={() => router.push({ pathname: '/meetings/[meetingId]/brief', params: { meetingId } })} />
              {m.joinTarget ? <Button kind="secondary" full label={clock ? `Join at ${clock.replace(/ (AM|PM)$/, '')}` : 'Join meeting'} loading={joining} onPress={join} /> : null}
            </>
          ) : m.joinTarget ? (
            <Button kind="primary" label="Join meeting" loading={joining} onPress={join} />
          ) : null}
        </BottomActionBar>
      }
    >
      <MeetingHero kicker={meetingKicker(m.startsAt, m.title)} headline={m.headline} reason={m.reason} />
      <View style={{ backgroundColor: c.raised, borderWidth: 1, borderColor: c.line, borderRadius: radius.card, padding: 18, marginBottom: 14 }}>
        {w.current ? (
          <Text variant="title" style={{ fontSize: 26, lineHeight: 31, letterSpacing: -0.6 }}>
            {w.current}
          </Text>
        ) : null}
        {w.original ? (
          <Text variant="meta" color="faint" style={{ marginTop: 6, textDecorationLine: 'line-through' }} accessibilityLabel={`Was ${w.original}`}>
            Was {w.original}
          </Text>
        ) : null}
        {m.minutesReturned != null ? (
          <>
            <View style={{ height: 1, backgroundColor: c.line, marginVertical: 14 }} />
            <Text variant="metaStrong" color="sage">
              {minutesLabel(m.minutesReturned)} returned
            </Text>
          </>
        ) : null}
      </View>
      {facts.length ? <FactList facts={facts} /> : null}
    </Screen>
  );
}
