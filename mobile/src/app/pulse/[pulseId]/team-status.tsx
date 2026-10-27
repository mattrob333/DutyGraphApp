import React from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { BottomActionBar, Button, Card, EmptyState, ErrorState, Heading, LoadingState, Screen, Text } from '@/components/common';
import { ProgressBar, TeamStatusList } from '@/components/pulse';
import { usePulse, useTeamStatus } from '@/hooks/queries';
import { progressFraction, pulseKicker } from '@/features/pulse/format';

export default function TeamStatusScreen() {
  const { pulseId } = useLocalSearchParams<{ pulseId: string }>();
  const pulseQ = usePulse(pulseId);
  const visible = pulseQ.data ? pulseQ.data.teamStatusVisible : undefined;
  const teamQ = useTeamStatus(visible === false ? '' : pulseId);

  const footer = (
    <BottomActionBar>
      <Button label="Back to Today" kind="primary" onPress={() => router.replace('/today')} />
    </BottomActionBar>
  );

  if (pulseQ.isLoading || (visible !== false && teamQ.isLoading)) return <LoadingState />;
  if (pulseQ.isError || !pulseQ.data) return <ErrorState error={pulseQ.error} onRetry={() => pulseQ.refetch()} />;

  if (visible === false) {
    return (
      <Screen footer={footer}>
        <Heading>{pulseQ.data.title}</Heading>
        <EmptyState>Team status isn't shared for this Pulse.</EmptyState>
      </Screen>
    );
  }
  if (teamQ.isError || !teamQ.data) return <ErrorState error={teamQ.error} onRetry={() => teamQ.refetch()} />;

  const t = teamQ.data;
  return (
    <Screen footer={footer}>
      <Text variant="label" color="faint">
        {pulseKicker(t)}
      </Text>
      <Heading style={{ marginTop: 8, marginBottom: 4 }}>{t.title}</Heading>
      <Text variant="bodyStrong" color="muted" accessibilityLiveRegion="polite">
        {`${t.completeCount} of ${t.totalCount} complete`}
      </Text>
      <View style={{ marginTop: 14, marginBottom: 12 }}>
        <ProgressBar fraction={progressFraction(t.completeCount, t.totalCount)} />
      </View>
      <Text variant="meta" color="muted" style={{ marginBottom: 18 }}>
        {t.note}
      </Text>
      {t.meetingOutcome ? (
        <Card tone="sage" onPress={() => router.push(t.meetingOutcome!.route as Href)} accessibilityLabel={`${t.meetingOutcome.title}. ${t.meetingOutcome.body}`}>
          <Text variant="bodyStrong" style={{ marginBottom: 4 }}>
            {t.meetingOutcome.title}
          </Text>
          <Text variant="metaStrong" color="sage">
            {t.meetingOutcome.body}
          </Text>
        </Card>
      ) : null}
      <TeamStatusList rows={t.rows} dueAt={t.dueAt} />
      <Text variant="small" color="faint" style={{ marginTop: 14 }}>
        Everyone on the team sees the same status — no rankings or scores.
      </Text>
    </Screen>
  );
}
