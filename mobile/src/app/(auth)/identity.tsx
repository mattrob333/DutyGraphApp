import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { BottomActionBar, Button, Card, ErrorState, Heading, LoadingState, Text } from '@/components/common';
import { AuthShell } from '@/features/auth/AuthShell';
import { useSignOut } from '@/features/auth/useSignOut';
import { ProfileHeader } from '@/components/me';
import { useMe } from '@/hooks/queries';

export default function Identity() {
  const me = useMe();
  const { signOutNow } = useSignOut();
  const [notMe, setNotMe] = useState(false);
  const [busy, setBusy] = useState(false);

  if (me.isLoading) return <LoadingState label="Checking your invitation…" />;
  if (me.isError || !me.data) return <ErrorState error={me.error} onRetry={() => me.refetch()} />;
  const p = me.data;

  async function reject() {
    setBusy(true);
    await signOutNow(false);
    setBusy(false);
    setNotMe(true);
  }

  if (notMe) {
    return (
      <AuthShell
        footer={
          <BottomActionBar>
            <Button kind="primary" label="Back to start" onPress={() => router.replace('/invite')} />
          </BottomActionBar>
        }
      >
        <Heading>Thanks for checking</Heading>
        <Card>
          <Text variant="bodyStrong" style={{ marginBottom: 4 }}>
            This phone has been disconnected
          </Text>
          <Text variant="meta" color="muted">
            Please contact your advisor. They can send a new invitation to the right person.
          </Text>
        </Card>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      footer={
        <BottomActionBar>
          <Button kind="primary" label="Yes, that's me" onPress={() => router.replace('/permissions/notifications')} />
          <Button label="Not me" loading={busy} onPress={reject} full />
        </BottomActionBar>
      }
    >
      <Heading>Is this you?</Heading>
      <Text color="muted" style={{ marginBottom: 18 }}>
        Check that this invitation is yours before you continue.
      </Text>
      <ProfileHeader displayName={p.displayName} subtitle={p.roleTitle} />
      <View style={{ height: 12 }} />
      <Text variant="meta" color="muted">
        {p.companyName}
      </Text>
    </AuthShell>
  );
}
