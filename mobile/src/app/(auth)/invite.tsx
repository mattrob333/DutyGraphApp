import React, { useRef, useState } from 'react';
import { Linking } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useRepository } from '@/api';
import { BottomActionBar, Button, Card, Heading, Text } from '@/components/common';
import { AuthShell } from '@/features/auth/AuthShell';
import { describeEnrollError, isSafeBrowserUrl, type EnrollFailure } from '@/features/auth/enrollErrors';
import { qk } from '@/hooks/queries';
import { useSessionStore } from '@/state/session';
import { newIdempotencyKey } from '@/utils/id';

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default function Invite() {
  const params = useLocalSearchParams<{ t?: string; url?: string }>();
  const token = first(params.t)?.trim() || undefined;
  const webUrl = first(params.url);
  const repo = useRepository();
  const qc = useQueryClient();
  // One key per invitation attempt, stable across retries so a repeat can't enroll twice.
  const key = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<EnrollFailure | null>(null);

  async function connect(t: string) {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    key.current ??= newIdempotencyKey();
    try {
      const me = await repo.enroll(t, key.current);
      qc.setQueryData(qk.me, me);
      useSessionStore.getState().signedIn();
      router.replace('/identity');
    } catch (e) {
      setFailure(describeEnrollError(e));
      // A used or expired link needs a fresh attempt next time; anything else may be retried with the same key.
      if (describeEnrollError(e).kind !== 'other') key.current = null;
    } finally {
      setBusy(false);
    }
  }

  const openInBrowser = () => {
    if (webUrl && isSafeBrowserUrl(webUrl)) Linking.openURL(webUrl).catch(() => {});
  };

  const footer = token ? (
    <BottomActionBar>
      {failure?.kind === 'useWeb' ? (
        webUrl ? <Button kind="primary" label="Open in browser" onPress={openInBrowser} /> : null
      ) : failure?.kind === 'expired' ? null : (
        <Button kind="primary" label={failure ? 'Try again' : 'Connect this phone'} loading={busy} onPress={() => connect(token)} />
      )}
    </BottomActionBar>
  ) : repo.kind === 'mock' ? (
    <BottomActionBar>
      <Button kind="primary" label="Continue with demo data" loading={busy} onPress={() => connect('demo')} />
    </BottomActionBar>
  ) : undefined;

  return (
    <AuthShell footer={footer}>
      <Heading>Welcome to DutyGraph Companion</Heading>
      <Text color="muted" style={{ marginBottom: 18 }}>
        DutyGraph Companion is for answering what DutyGraph needs from you: a short Pulse, a quick question, a change in your work. You review everything before it is sent.
      </Text>

      {token ? (
        <Card>
          <Text variant="bodyStrong" style={{ marginBottom: 4 }}>
            Your advisor sent you an invitation
          </Text>
          <Text variant="meta" color="muted">
            Connecting links this phone to your DutyGraph account. It only takes a moment.
          </Text>
        </Card>
      ) : (
        <Card>
          <Text variant="bodyStrong" style={{ marginBottom: 4 }}>
            Open your invitation link
          </Text>
          <Text variant="meta" color="muted">
            Open the invitation link from your email or text on this phone. If you don't have one, ask your advisor to send you a new invitation.
          </Text>
        </Card>
      )}

      {failure ? (
        <Card tone={failure.kind === 'other' ? 'red' : 'amber'}>
          <Text accessibilityLiveRegion="assertive" accessibilityRole="alert" variant="bodyStrong">
            {failure.message}
          </Text>
          {failure.kind === 'useWeb' && !webUrl ? (
            <Text variant="meta" color="muted" style={{ marginTop: 6 }}>
              Open the invitation link from your email or text in your phone's browser.
            </Text>
          ) : null}
        </Card>
      ) : null}
    </AuthShell>
  );
}
