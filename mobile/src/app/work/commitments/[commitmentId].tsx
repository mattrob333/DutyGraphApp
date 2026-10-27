import React from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { ErrorState, Heading, KeyValueList, LoadingState, Screen, StatusChip, Text } from '@/components/common';
import { CompleteCommitmentBar } from '@/components/work';
import { commitmentRows } from '@/features/commitments/format';
import { useCommitment } from '@/hooks/queries';

export default function CommitmentDetail() {
  const { commitmentId } = useLocalSearchParams<{ commitmentId: string }>();
  const q = useCommitment(commitmentId);
  if (q.isPending) return <LoadingState />;
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const c = q.data;
  return (
    <Screen footer={<CompleteCommitmentBar commitment={c} />} refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <Text variant="label" color="faint">
        Commitment
      </Text>
      <Heading style={{ marginTop: 10, marginBottom: 12 }}>{c.title}</Heading>
      {c.status === 'COMPLETE' ? (
        <View style={{ marginBottom: 8 }}>
          <StatusChip label="Completed" tone="sage" />
        </View>
      ) : null}
      <View style={{ marginTop: 10 }}>
        <KeyValueList rows={commitmentRows(c)} />
      </View>
    </Screen>
  );
}
