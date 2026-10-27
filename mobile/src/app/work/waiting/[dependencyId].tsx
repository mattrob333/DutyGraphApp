import React from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { ErrorState, Heading, KeyValueList, LoadingState, Screen, Text } from '@/components/common';
import { waitingRows } from '@/features/commitments/format';
import { useCommitment } from '@/hooks/queries';

/** Read-only: DutyGraph follows up, the participant is never asked to chase anyone. */
export default function WaitingDetail() {
  const { dependencyId } = useLocalSearchParams<{ dependencyId: string }>();
  const q = useCommitment(dependencyId);
  if (q.isPending) return <LoadingState />;
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const c = q.data;
  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <Text variant="label" color="faint">
        Waiting on
      </Text>
      <Heading style={{ marginTop: 10, marginBottom: 12 }}>{c.title}</Heading>
      <View style={{ marginTop: 10 }}>
        <KeyValueList rows={waitingRows(c)} />
      </View>
    </Screen>
  );
}
