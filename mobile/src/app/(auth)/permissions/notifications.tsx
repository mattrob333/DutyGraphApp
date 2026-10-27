import React, { useState } from 'react';
import { router } from 'expo-router';
import { useRepository } from '@/api';
import { BottomActionBar, Button, Card, Heading, Text } from '@/components/common';
import { AuthShell } from '@/features/auth/AuthShell';
import { captureExpoPushToken, requestPermission } from '@/features/notifications/pushToken';
import { usePreferencesStore } from '@/state/preferences';

const EXAMPLES = [
  { title: 'Pulse ready', body: 'Your Monday Pulse is ready. About 4 minutes.' },
  { title: 'Meeting changes', body: "You don't need to join the 11:00 meeting." },
  { title: 'Commitments due', body: 'Your update is due at 4:00 PM.' },
];

export default function NotificationPermission() {
  const repo = useRepository();
  const setAsked = usePreferencesStore((s) => s.setNotificationsAsked);
  const [busy, setBusy] = useState(false);

  const finish = () => {
    setAsked(true);
    router.replace('/today');
  };

  async function turnOn() {
    setBusy(true);
    try {
      const state = await requestPermission();
      if (state === 'granted' && repo.kind === 'http') await captureExpoPushToken();
    } finally {
      setBusy(false);
      finish();
    }
  }

  return (
    <AuthShell
      footer={
        <BottomActionBar>
          <Button kind="primary" label="Turn on notifications" loading={busy} onPress={turnOn} />
          <Button label="Not now" disabled={busy} onPress={finish} full />
        </BottomActionBar>
      }
    >
      <Heading>Want a nudge when something needs you?</Heading>
      <Text color="muted" style={{ marginBottom: 18 }}>
        Notifications tell you when DutyGraph needs something from you, and when you're no longer needed somewhere. You can change this any time in Me.
      </Text>
      {EXAMPLES.map((e) => (
        <Card key={e.title} level="surface" accessibilityLabel={undefined}>
          <Text variant="label" color="faint" style={{ marginBottom: 4 }}>
            {e.title}
          </Text>
          <Text variant="meta" color="muted">
            {e.body}
          </Text>
        </Card>
      ))}
    </AuthShell>
  );
}
