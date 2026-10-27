import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import { ErrorState, Heading, LoadingState, Screen, Text, Button, Card } from '@/components/common';
import { SettingsGroup, SwitchRow } from '@/components/me';
import { usePreferenceToggles } from '@/features/profile/usePreferenceToggles';
import { getPermissionState, requestPermission, type PermissionState } from '@/features/notifications/pushToken';

export default function NotificationSettings() {
  const { me, notifications, setNotification } = usePreferenceToggles();
  const [perm, setPerm] = useState<PermissionState>('unsupported');

  const refresh = useCallback(() => {
    getPermissionState().then(setPerm);
  }, []);
  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    return () => sub.remove();
  }, [refresh]);

  if (me.isLoading) return <LoadingState />;
  if (me.isError || !notifications) return <ErrorState error={me.error} onRetry={() => me.refetch()} />;

  return (
    <Screen>
      <Heading>Notifications</Heading>
      <Text color="muted" style={{ marginBottom: 6 }}>
        DutyGraph only nudges you about things that need you: a Pulse, a meeting change, or something due.
      </Text>

      {perm !== 'unsupported' && perm !== 'granted' ? (
        <Card level="surface" style={{ marginTop: 14 }}>
          <Text variant="bodyStrong" style={{ marginBottom: 4 }}>
            Notifications are off on this phone
          </Text>
          <Text variant="meta" color="muted">
            {perm === 'denied' ? 'Turn them on in your phone settings to get these reminders.' : 'Allow notifications to get these reminders.'}
          </Text>
          <Button
            label={perm === 'denied' ? 'Open phone settings' : 'Turn on notifications'}
            onPress={() => (perm === 'denied' ? Linking.openSettings() : requestPermission().then(refresh))}
            style={{ marginTop: 12 }}
          />
        </Card>
      ) : null}

      <SettingsGroup title="Tell me about">
        <SwitchRow label="Pulse reminders" sub="When a Pulse opens, and once before it is due" value={notifications.pulseReady} onChange={(v) => setNotification('pulseReady', v)} />
        <SwitchRow label="Meeting changes" sub="Cancelled, shortened, or you are needed" value={notifications.meetingChanges} onChange={(v) => setNotification('meetingChanges', v)} />
        <SwitchRow label="Commitments due" sub="Two hours before" value={notifications.commitmentsDue} onChange={(v) => setNotification('commitmentsDue', v)} />
      </SettingsGroup>

      <SettingsGroup title="Quiet hours">
        <SwitchRow label="Quiet hours" sub="Nothing between 6 PM and 7 AM" value={notifications.quietHours} onChange={(v) => setNotification('quietHours', v)} />
      </SettingsGroup>
      <Text variant="small" color="faint" style={{ marginTop: 10 }}>
        {Platform.OS === 'web' ? 'Push notifications are available in the phone app.' : 'Urgent changes, like a meeting starting soon, may still come through.'}
      </Text>
    </Screen>
  );
}
