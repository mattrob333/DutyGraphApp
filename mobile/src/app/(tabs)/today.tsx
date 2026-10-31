import React from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Card, EmptyState, ErrorState, Heading, LoadingState, Screen, SectionLabel, Text } from '@/components/common';
import { RequestCard } from '@/components/requests';
import { useToday } from '@/hooks/queries';
import { openRequest, primaryRequestId, scopedFeed } from '@/features/today/requests';
import { isFullScope } from '@/features/today/scope';
import { formatLongDate, greeting } from '@/utils/time';
import { radius, useColors } from '@/theme';
import type { Href } from 'expo-router';

export default function TodayScreen() {
  const c = useColors();
  const q = useToday();
  if (q.isLoading) return <LoadingState label="Loading your day…" />;
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;

  // With the `questions` scope Today lists question requests and task checks only (spec §6.1).
  const full = isFullScope();
  const feed = scopedFeed(q.data);
  const now = new Date(feed.asOf);
  const primaryId = primaryRequestId(feed.dueNow);

  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <Text variant="meta" color="faint">
        {formatLongDate(now)}
      </Text>
      <Heading style={{ marginBottom: 18 }}>{`${greeting(now)}, ${feed.participant.firstName}`}</Heading>

      {full && feed.banner ? (
        <Card tone="sage" onPress={() => router.push(feed.banner!.route as Href)} accessibilityLabel={`${feed.banner.title}. ${feed.banner.body}`} style={{ marginBottom: 18 }}>
          <Text variant="bodyStrong" style={{ marginBottom: 4 }}>
            {feed.banner.title}
          </Text>
          <Text variant="metaStrong" color="sage">
            {feed.banner.body}
          </Text>
        </Card>
      ) : null}

      <SectionLabel style={{ marginTop: 0 }}>Due now</SectionLabel>
      {feed.dueNow.length === 0 ? (
        <EmptyState>Nothing needs you right now. We'll let you know when it does.</EmptyState>
      ) : (
        feed.dueNow.map((r) => <RequestCard key={r.id} request={r} now={now} variant="dueNow" primary={r.id === primaryId} onOpen={openRequest} />)
      )}

      {feed.later.length > 0 ? (
        <>
          <SectionLabel>Later</SectionLabel>
          {feed.later.map((r) => (
            <RequestCard key={r.id} request={r} now={now} variant="later" onOpen={openRequest} />
          ))}
        </>
      ) : null}

      {feed.doneToday.length > 0 ? (
        <>
          <SectionLabel>Done today</SectionLabel>
          <Card level="surface" style={{ paddingVertical: 6, marginBottom: 0 }}>
            {feed.doneToday.map((d) => (
              <View key={d.id} accessible accessibilityLabel={`Done: ${d.title}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 }}>
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.sage }} />
                <Text variant="body" color="muted" style={{ flex: 1, fontSize: 15 }}>
                  {d.title}
                </Text>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {/* The employee pilot app's Home (October 30): Task Cards, company files and Upload, one tap each. */}
      <SectionLabel>Your work</SectionLabel>
      <Card level="surface" style={{ paddingVertical: 4, marginBottom: 0 }}>
        {(
          [
            ['Your Task Cards', 'Cards you wrote or your AI sent', '/earn/drafts'],
            ['Company files', 'How your company works, as shared with the team', '/files'],
            ['Upload a file or photo', 'Send a form, a checklist or a scan to your advisor', '/upload'],
          ] as const
        ).map(([title, detail, route], i) => (
          <Pressable
            key={route}
            accessibilityRole="button"
            accessibilityLabel={`${title}. ${detail}`}
            onPress={() => router.push(route as Href)}
            style={({ pressed }) => ({ minHeight: 44, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: c.line, opacity: pressed ? 0.8 : 1 })}
          >
            <Text variant="bodyStrong">{title}</Text>
            <Text variant="small" color="faint" style={{ marginTop: 2 }}>
              {detail}
            </Text>
          </Pressable>
        ))}
      </Card>

      {full ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Something changed? Tell DutyGraph"
          onPress={() => router.push('/something-changed')}
          style={({ pressed }) => ({
            marginTop: 22,
            minHeight: 44,
            borderWidth: 1,
            borderColor: c.line,
            borderRadius: radius.card,
            paddingVertical: 14,
            paddingHorizontal: 16,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Text variant="bodyStrong" style={{ lineHeight: 21 }}>
            Something changed?
          </Text>
          <Text variant="small" color="faint" style={{ marginTop: 4 }}>
            Tell DutyGraph
          </Text>
        </Pressable>
      ) : null}
    </Screen>
  );
}
