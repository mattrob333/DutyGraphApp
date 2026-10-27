/**
 * Completion screens shown only after the server acknowledged the submit.
 *
 * - Pulse (`pulseId` given): "Pulse submitted", what was sent, See team status.
 * - Everything else: "Sent. Thank you." with the server's own body copy.
 *
 * The acknowledged result is read from the in-memory result store; without it
 * (app restarted, deep link) the screen falls back to the session's server
 * state and generic copy. It never claims completion for a session the server
 * has not marked submitted.
 */
import React, { useCallback } from 'react';
import { BackHandler, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { radius, useColors } from '@/theme';
import { BottomActionBar, Button, ErrorState, LoadingState, Screen, SectionLabel, Text } from '@/components/common';
import { useConversation, usePulse } from '@/hooks/queries';
import { reviewHref } from './routes';
import { useResultStore } from './resultStore';

/** Back to Today without leaving the submitted flow reachable. */
export function goToToday() {
  router.dismissTo('/today');
}

function CheckBadge({ size }: { size: number }) {
  const c = useColors();
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Done"
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.sageBg, alignItems: 'center', justifyContent: 'center' }}
    >
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={c.sage} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M5 12.5 10 17.5 19 7" />
      </Svg>
    </View>
  );
}

function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  return m ? `${m}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function DoneScreen({ sessionId, pulseId }: { sessionId: string; pulseId?: string }) {
  const c = useColors();
  const stored = useResultStore((s) => s.results[sessionId]);
  const conv = useConversation(sessionId);
  const pulse = usePulse(pulseId ?? '');

  // Hardware back must not return into the submitted flow.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        goToToday();
        return true;
      });
      return () => sub.remove();
    }, []),
  );

  const acknowledged = !!stored || conv.data?.state === 'SUBMITTED';
  if (!stored && conv.isPending) return <LoadingState />;
  if (!acknowledged) {
    if (conv.error) return <ErrorState error={conv.error} onRetry={() => void conv.refetch()} />;
    return (
      <Screen footer={<BottomActionBar><Button label="Back to Today" kind="primary" onPress={goToToday} /></BottomActionBar>}>
        <Text variant="title" accessibilityRole="header" style={{ marginBottom: 8 }}>
          Not sent yet
        </Text>
        <Text variant="body" color="muted" style={{ marginBottom: 20 }}>
          Nothing has reached DutyGraph for this yet. Your answers are safe. Review them and send when you're ready.
        </Text>
        {conv.data ? <Button label="Go to review" onPress={() => router.replace(reviewHref(conv.data))} /> : null}
      </Screen>
    );
  }

  const result = stored?.result;
  const summary = stored?.summary;

  if (pulseId) {
    const teamVisible = pulse.data?.teamStatusVisible !== false;
    const teamRoute = `/pulse/${pulseId}/team-status`;
    return (
      <Screen
        footer={
          <BottomActionBar>
            {teamVisible ? <Button label="See team status" kind="primary" onPress={() => router.replace(teamRoute as never)} /> : null}
            <Button label="Back to Today" kind={teamVisible ? 'secondary' : 'primary'} full onPress={goToToday} />
          </BottomActionBar>
        }
      >
        <View style={{ paddingTop: 18 }}>
          <View style={{ marginBottom: 20 }}>
            <CheckBadge size={52} />
          </View>
          <View accessibilityLiveRegion="polite">
            <Text variant="display" accessibilityRole="header" style={{ marginBottom: 8, fontSize: 30, lineHeight: 36 }}>
              {result?.headline ?? 'Pulse submitted'}
            </Text>
            <Text variant="body" color="muted" style={{ marginBottom: 22 }}>
              {result?.body ?? 'Your Pulse was sent to DutyGraph.'}
            </Text>
          </View>
          {stored?.elapsedMs !== undefined ? (
            <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, borderRadius: radius.card, paddingHorizontal: 18, paddingVertical: 6, marginBottom: 22 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 11 }}>
                <Text variant="meta" color="faint">
                  Time
                </Text>
                <Text variant="metaStrong">{formatDuration(stored.elapsedMs)}</Text>
              </View>
            </View>
          ) : null}
          {summary && summary.total > 0 ? (
            <>
              <SectionLabel style={{ marginTop: 0 }}>What you sent</SectionLabel>
              <View style={{ gap: 10 }}>
                {summary.confirmed > 0 ? <Line color={c.sage} text={`${plural(summary.confirmed, 'point', 'points')} confirmed as written`} /> : null}
                {summary.changed > 0 ? <Line color={c.violet} text={`${plural(summary.changed, 'point', 'points')} in your own words`} /> : null}
                {summary.unchecked > 0 ? <Line color={c.amber} text={`${plural(summary.unchecked, 'point', 'points')} you didn't check`} /> : null}
              </View>
            </>
          ) : null}
        </View>
      </Screen>
    );
  }

  return (
    <Screen footer={<BottomActionBar><Button label="Back to Today" kind="primary" onPress={goToToday} /></BottomActionBar>} contentContainerStyle={{ paddingTop: 48 }}>
      <View accessibilityLiveRegion="polite" style={{ alignItems: 'center' }}>
        <View style={{ marginBottom: 20 }}>
          <CheckBadge size={56} />
        </View>
        <Text variant="display" align="center" accessibilityRole="header" style={{ marginBottom: 10, fontSize: 28, lineHeight: 35 }}>
          {result?.headline ?? 'Sent. Thank you.'}
        </Text>
        <Text variant="body" color="muted" align="center" style={{ maxWidth: 340 }}>
          {result?.body ?? 'Your answers reached DutyGraph.'}
        </Text>
      </View>
    </Screen>
  );
}

function Line({ color, text }: { color: string; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <Text variant="body">{text}</Text>
    </View>
  );
}
