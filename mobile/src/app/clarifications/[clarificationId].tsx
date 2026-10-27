import React, { useRef } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { BottomActionBar, Button, ErrorState, Heading, LoadingState, Screen, Text, errorMessage } from '@/components/common';
import { ClarificationOptions, ResolvedCard, StatementCard } from '@/components/work';
import { useStartFlow } from '@/features/conversation/useStartFlow';
import { useClarification, useMe, useRespondToClarification } from '@/hooks/queries';
import { showToast } from '@/state/ui';
import { track } from '@/analytics/events';
import { newIdempotencyKey } from '@/utils/id';
import type { ClarificationOption } from '@/types/domain';

export default function ClarificationScreen() {
  const { clarificationId } = useLocalSearchParams<{ clarificationId: string }>();
  const q = useClarification(clarificationId);
  const me = useMe();
  const respond = useRespondToClarification();
  const flow = useStartFlow();
  // One key per (screen, option): a retry of the same answer is idempotent, a different answer is a different request.
  const keys = useRef<Record<string, string>>({});
  const busy = useRef(false);
  const [pendingId, setPendingId] = React.useState<string | undefined>();

  if (q.isPending) return <LoadingState />;
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const c = q.data;
  const resolved = c.status === 'RESOLVED' || respond.isSuccess;

  const onPick = async (o: ClarificationOption) => {
    if (busy.current) return;
    busy.current = true;
    setPendingId(o.id);
    try {
      if (o.opensConversation) {
        // A short conversation, voice if that is the participant's preference. Voice still passes the mic disclosure.
        const input = me.data?.voicePreferences.voiceFirst ? 'voice' : 'text';
        await flow.begin({ requestId: c.requestId, mode: 'CLARIFICATION', input, clarificationOptionId: o.id });
        return;
      }
      keys.current[o.id] ??= newIdempotencyKey();
      try {
        await respond.mutateAsync({ clarificationId: c.id, optionId: o.id, idempotencyKey: keys.current[o.id] });
        track('clarification_completed', { clarificationId: c.id });
      } catch (e) {
        showToast({ title: "Couldn't save your answer", body: errorMessage(e) });
      }
    } finally {
      busy.current = false;
      setPendingId(undefined);
    }
  };

  const headline = respond.data?.headline ?? 'Thanks — that settles it';
  const body = respond.data?.body ?? (c.resolvedLabel ? `Recorded as: ${c.resolvedLabel}.` : undefined);

  return (
    <Screen
      footer={
        resolved ? (
          <BottomActionBar>
            <Button label="Back to Today" kind="primary" onPress={() => router.replace('/today')} />
          </BottomActionBar>
        ) : undefined
      }
    >
      <Text variant="label" color="faint">
        Clarification
      </Text>
      <Heading style={{ marginTop: 10, marginBottom: 18 }}>{c.context || 'DutyGraph needs your help'}</Heading>
      {c.existingStatement ? <StatementCard source={c.existingStatement.source} text={c.existingStatement.text} /> : null}
      {c.conflictingStatement ? <StatementCard source={c.conflictingStatement.source} text={c.conflictingStatement.text} /> : null}
      <View style={{ height: 14 }} />
      {resolved ? (
        <ResolvedCard headline={headline} body={body} />
      ) : (
        <>
          <Text variant="cardTitle" accessibilityRole="header" style={{ fontSize: 19, marginBottom: 12 }}>
            {c.prompt}
          </Text>
          <ClarificationOptions options={c.options} onPick={onPick} disabled={!!pendingId || flow.isPending} pendingId={pendingId} />
        </>
      )}
    </Screen>
  );
}
