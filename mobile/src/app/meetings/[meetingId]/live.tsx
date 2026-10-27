import React, { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { BottomActionBar, Button, ErrorState, LoadingState, Screen, Text } from '@/components/common';
import { FacilitatingBars } from '@/components/meetings/FacilitatingBars';
import { formatRemaining } from '@/features/meetings/format';
import { useNow } from '@/features/meetings/useJoinMeeting';
import { useLiveMeeting } from '@/hooks/queries';
import { openSheet } from '@/state/ui';
import { radius, useColors } from '@/theme';

function Tile({ label, value, tone }: { label: string; value: string; tone?: 'sage' | 'amber' }) {
  const c = useColors();
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}`}
      style={{ flex: 1, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, borderRadius: radius.card, paddingVertical: 13, paddingHorizontal: 14 }}
    >
      <Text variant="small" color="faint" style={{ marginBottom: 6 }}>
        {label}
      </Text>
      <Text variant="bodyStrong" color={tone ?? 'ink'} style={{ fontSize: 15, lineHeight: 20 }}>
        {value}
      </Text>
    </View>
  );
}

/**
 * Post-MVP live companion (PRD 5.2). Read-only render of server state, the
 * meeting itself happens in the provider's app. "Raise hand" is a local
 * indicator only; the server has no hand-raise endpoint yet.
 */
export default function MeetingLiveScreen() {
  const { meetingId } = useLocalSearchParams<{ meetingId: string }>();
  const q = useLiveMeeting(meetingId);
  const c = useColors();
  const now = useNow(1000);
  const [hand, setHand] = useState(false);

  if (q.isPending) return <LoadingState />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const s = q.data;
  const remaining = formatRemaining(s.endsAt, now);
  const still = s.closeReady ? 'Nothing further' : s.decisionOwner ? `${s.decisionOwner}'s decision` : 'An answer from the group';
  return (
    <Screen
      contentContainerStyle={{ paddingTop: 20 }}
      footer={
        <BottomActionBar>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button
              kind="secondary"
              full
              label={hand ? 'Lower hand' : 'Raise hand'}
              accessibilityState={{ selected: hand }}
              style={{ flex: 1, minHeight: 48 }}
              onPress={() => setHand((h) => !h)}
            />
            <Button kind="primary" label="Wrap up" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/meetings/[meetingId]/wrap-up', params: { meetingId } })} />
          </View>
        </BottomActionBar>
      }
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <Text variant="small" color="faint">
          In Google Meet
        </Text>
        <Text
          accessibilityRole="timer"
          accessibilityLabel={`${remaining} left`}
          variant="bodyStrong"
          style={{ fontSize: 15, lineHeight: 18, fontVariant: ['tabular-nums'] }}
        >
          {remaining} left
        </Text>
      </View>
      <Text variant="title" accessibilityRole="header" style={{ fontSize: 24, lineHeight: 30, letterSpacing: -0.6, marginTop: 10, marginBottom: 16 }}>
        {s.title}
      </Text>
      <View
        style={{ backgroundColor: c.violetBg, borderWidth: 1, borderColor: c.line, borderRadius: radius.card, paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', gap: 14, alignItems: 'center', marginBottom: 20 }}
      >
        <FacilitatingBars />
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong" color="violet" style={{ fontSize: 15, lineHeight: 20 }}>
            DutyGraph is facilitating
          </Text>
          <Text variant="small" color="muted" style={{ lineHeight: 19 }}>
            Listening for decisions, commitments, open questions and changes to your work. Announced to everyone in the call.
          </Text>
        </View>
      </View>
      <Text variant="label" color="faint" style={{ marginBottom: 8 }}>
        Current question
      </Text>
      <Text variant="question" style={{ fontFamily: 'DMSans_500Medium', fontSize: 20, lineHeight: 28, letterSpacing: -0.3, marginBottom: 18 }}>
        {s.currentQuestion}
      </Text>
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
        <Tile label="Decision status" value={s.closeReady ? 'Ready to decide' : 'Not ready'} tone={s.closeReady ? 'sage' : 'amber'} />
        <Tile label="Still needed" value={still} />
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button
          kind="secondary"
          full
          label={`Parking lot · ${s.parkingLot.length}`}
          style={{ flex: 1 }}
          onPress={() => openSheet({ title: 'Parking lot', paragraphs: s.parkingLot.length ? s.parkingLot : ['Nothing has been parked yet.'] })}
        />
        <Button
          kind="secondary"
          full
          label="View transcript"
          style={{ flex: 1 }}
          onPress={() => openSheet({ title: 'Transcript', paragraphs: s.recentTranscript.length ? s.recentTranscript : ['No transcript yet.'] })}
        />
      </View>
      {hand ? (
        <View
          accessibilityLiveRegion="polite"
          style={{ marginTop: 14, flexDirection: 'row', gap: 9, alignItems: 'center', backgroundColor: c.accentBg, borderRadius: radius.button, paddingVertical: 11, paddingHorizontal: 13 }}
        >
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.ink }} />
          <Text variant="metaStrong" style={{ flex: 1 }}>
            Your hand is up. DutyGraph will bring you in next.
          </Text>
        </View>
      ) : null}
    </Screen>
  );
}
