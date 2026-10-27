import React, { useEffect, useRef } from 'react';
import { router, type Href } from 'expo-router';
import { Card, EmptyState, ErrorState, Heading, LoadingState, Screen, Text } from '@/components/common';
import { View } from 'react-native';
import { useMarkNotificationsRead, useNotifications } from '@/hooks/queries';
import { requestInScope } from '@/features/today/scope';

export default function NotificationsScreen() {
  const q = useNotifications();
  const markRead = useMarkNotificationsRead();
  const marked = useRef(false);
  useEffect(() => {
    if (marked.current) return;
    marked.current = true;
    markRead.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (q.isLoading) return <LoadingState />;
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  // The `questions` scope hides Pulse, meeting and commitment items (their screens are hidden too).
  const items = q.data.filter((n) => requestInScope({ route: n.route }));

  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <Heading style={{ marginBottom: 16 }}>Notifications</Heading>
      {items.length === 0 ? <EmptyState>No notifications yet.</EmptyState> : null}
      {items.map((n) => (
        <Card
          key={n.id}
          level="surface"
          onPress={() => router.push(n.route as Href)}
          accessibilityLabel={`${n.typeLabel}, ${n.timeLabel}. ${n.title}. ${n.body}`}
          style={{ paddingVertical: 14, paddingHorizontal: 16, marginBottom: 10 }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
            <Text variant="label" color="faint">
              {n.typeLabel}
            </Text>
            <Text variant="chip" color="faint">
              {n.timeLabel}
            </Text>
          </View>
          <Text variant="bodyStrong" style={{ fontSize: 15, lineHeight: 21 }}>
            {n.title}
          </Text>
          <Text variant="meta" color="muted" style={{ marginTop: 2 }}>
            {n.body}
          </Text>
        </Card>
      ))}
    </Screen>
  );
}
