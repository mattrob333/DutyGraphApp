import React from 'react';
import { EmptyState, ErrorState, Heading, LoadingState, Screen, Text } from '@/components/common';
import { WorkSections } from '@/components/work';
import { useWork } from '@/hooks/queries';

export default function WorkScreen() {
  const q = useWork();
  if (q.isPending) return <LoadingState label="Loading your commitments…" />;
  if (q.isError && !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <Heading style={{ marginBottom: 6 }}>My commitments</Heading>
      <Text variant="body" color="muted" style={{ marginBottom: 6 }}>
        What you owe, and what you're waiting on.
      </Text>
      {q.data ? <WorkSections work={q.data} /> : <EmptyState>Nothing here yet.</EmptyState>}
    </Screen>
  );
}
