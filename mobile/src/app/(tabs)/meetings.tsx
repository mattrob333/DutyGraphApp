import React from 'react';
import { router, type Href } from 'expo-router';
import { EmptyState, ErrorState, Heading, LoadingState, Screen, SectionLabel, Text } from '@/components/common';
import { MeetingStateCard } from '@/components/meetings/MeetingStateCard';
import { groupMeetings } from '@/features/meetings/format';
import { useMeetings } from '@/hooks/queries';

export default function MeetingsScreen() {
  const q = useMeetings();
  if (q.isPending) return <LoadingState label="Loading your meetings…" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const groups = groupMeetings(q.data ?? []);
  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <Heading style={{ marginBottom: 6 }}>Meetings</Heading>
      <Text variant="body" color="muted" style={{ fontSize: 15, lineHeight: 22 }}>
        Only the ones that still need you live.
      </Text>
      {groups.length === 0 ? (
        <>
          <SectionLabel>Today</SectionLabel>
          <EmptyState>No meetings need you right now.</EmptyState>
        </>
      ) : (
        groups.map((g) => (
          <React.Fragment key={g.key}>
            <SectionLabel>{g.label}</SectionLabel>
            {g.items.map((m) => (
              <MeetingStateCard key={m.id} meeting={m} onPress={m.route ? () => router.push(m.route as Href) : undefined} />
            ))}
          </React.Fragment>
        ))
      )}
    </Screen>
  );
}
