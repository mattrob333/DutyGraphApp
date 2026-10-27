import React from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { BottomActionBar, Button, Card, ErrorState, Heading, LoadingState, Screen, Text } from '@/components/common';
import { PulseCoverageCard } from '@/components/pulse';
import { useRepository } from '@/api';
import { MockCompanionRepository } from '@/api/mock/MockCompanionRepository';
import { usePulse } from '@/hooks/queries';
import { useStartFlow } from '@/features/conversation/useStartFlow';
import { coverageRows, pulseKicker, replacesMeetingLine } from '@/features/pulse/format';
import { openSheet } from '@/state/ui';

export default function PulseIntroScreen() {
  const { pulseId } = useLocalSearchParams<{ pulseId: string }>();
  const repository = useRepository();
  const q = usePulse(pulseId);
  const flow = useStartFlow();

  if (q.isLoading) return <LoadingState />;
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;

  const pulse = q.data;
  const complete = pulse.status === 'COMPLETE';
  const inProgress = pulse.status === 'IN_PROGRESS';
  const replaces = replacesMeetingLine(pulse);
  const topics = repository.kind === 'mock' ? MockCompanionRepository.pulseTopics : undefined;
  const cover = coverageRows(pulse, topics);

  const start = (input: 'voice' | 'text') => flow.begin({ requestId: pulse.requestId, mode: 'PULSE', input });
  const openTeam = () => router.push({ pathname: '/pulse/[pulseId]/team-status', params: { pulseId: pulse.id } });

  const footer = complete ? (
    <BottomActionBar>
      {pulse.teamStatusVisible ? <Button label="See team status" kind="primary" onPress={openTeam} /> : null}
      <Button label="Back to Today" kind={pulse.teamStatusVisible ? 'secondary' : 'primary'} full onPress={() => router.replace('/today')} />
    </BottomActionBar>
  ) : (
    <BottomActionBar>
      <Button label={inProgress ? 'Continue with voice' : 'Start with voice'} kind="primary" loading={flow.isPending} onPress={() => start('voice')} />
      <Button label="Type instead" full disabled={flow.isPending} onPress={() => start('text')} />
    </BottomActionBar>
  );

  return (
    <Screen footer={footer}>
      <Text variant="label" color="faint">
        {pulseKicker(pulse)}
      </Text>
      {complete ? (
        <>
          <Heading style={{ marginTop: 10, marginBottom: 12 }}>{`Your ${pulse.title} is in`}</Heading>
          <Card tone="sage">
            <Text variant="bodyStrong" style={{ marginBottom: 4 }}>
              Submitted. Thank you.
            </Text>
            <Text variant="meta" color="sage">
              You reviewed and sent this yourself.
            </Text>
          </Card>
        </>
      ) : (
        <>
          <Heading style={{ marginTop: 10, marginBottom: 12 }}>{`Let's do your ${pulse.title}`}</Heading>
          <Text variant="body" color="muted" style={{ marginBottom: 14, lineHeight: 25 }}>
            I'll ask a few questions based on your current work. Answer naturally — I'll only follow up when something needs clarifying.
          </Text>
          {replaces ? (
            <Text variant="body" color="muted" style={{ marginBottom: 20, lineHeight: 25 }}>
              {replaces}
            </Text>
          ) : null}
          <PulseCoverageCard minutes={pulse.estimatedMinutes} numbered={cover.numbered} rows={cover.rows} />
          <Text variant="small" color="faint" style={{ marginTop: 16 }}>
            You can review everything before it's submitted.
          </Text>
          <View style={{ alignSelf: 'flex-start' }}>
            <Button
              label="Why am I being asked this?"
              kind="link"
              onPress={() => openSheet({ title: 'Why am I being asked this?', paragraphs: pulse.whyAsked })}
              style={{ marginTop: 8, paddingHorizontal: 0 }}
            />
          </View>
        </>
      )}
    </Screen>
  );
}
