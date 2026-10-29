import { EarnEntry } from "@/features/earn/Screens";
import React from 'react';
import { router } from 'expo-router';
import { useRepository } from '@/api';
import { Button, ErrorState, Heading, LoadingState, Screen, SectionLabel, Text } from '@/components/common';
import { APPEARANCE_OPTIONS, DeveloperPanel, NavRow, ProfileHeader, Segmented, SettingsGroup, SwitchRow, TimeReturnedCard } from '@/components/me';
import { useSignOut } from '@/features/auth/useSignOut';
import { usePreferenceToggles } from '@/features/profile/usePreferenceToggles';
import { useTimeReturned } from '@/features/profile/useTimeReturned';
import { usePreferencesStore } from '@/state/preferences';
import { isFullScope } from '@/features/today/scope';
import { radius, useColors } from '@/theme';
import { View } from 'react-native';

export default function MeTab() {
  const c = useColors();
  const repo = useRepository();
  const { me, notifications, voice, setNotification, setVoice } = usePreferenceToggles();
  const time = useTimeReturned();
  const appearance = usePreferencesStore((s) => s.appearance);
  const setAppearance = usePreferencesStore((s) => s.setAppearance);
  const { confirmAndSignOut } = useSignOut();

  if (me.isLoading) return <LoadingState />;
  if (me.isError || !me.data) return <ErrorState error={me.error} onRetry={() => me.refetch()} />;
  const p = me.data;
  const subtitle = p.roleTitle;
  // Pulse, meetings, commitments and Something changed are hidden with the `questions` scope (spec §6.1).
  const full = isFullScope();

  return (
    <Screen refreshing={me.isRefetching} onRefresh={() => me.refetch()}>
      <Heading>You</Heading>
      <ProfileHeader displayName={p.displayName} subtitle={subtitle} />
      <EarnEntry />

      {full && time ? (
        <>
          <SectionLabel>This month</SectionLabel>
          <TimeReturnedCard data={time} />
        </>
      ) : null}

      {full ? (
        <Button
          label="Something changed in my work"
          onPress={() => router.push('/something-changed')}
          full
          style={{ marginTop: 12, minHeight: 52, alignItems: 'flex-start', borderRadius: radius.card }}
        />
      ) : null}

      {notifications ? (
        <SettingsGroup title="Notifications">
          {full ? (
            <>
              <SwitchRow label="Pulse reminders" sub="When a Pulse opens, and once before it is due" value={notifications.pulseReady} onChange={(v) => setNotification('pulseReady', v)} />
              <SwitchRow label="Meeting changes" sub="Cancelled, shortened, or you are needed" value={notifications.meetingChanges} onChange={(v) => setNotification('meetingChanges', v)} />
              <SwitchRow label="Commitments due" sub="Two hours before" value={notifications.commitmentsDue} onChange={(v) => setNotification('commitmentsDue', v)} />
            </>
          ) : null}
          <SwitchRow label="Quiet hours" sub="Nothing between 6 PM and 7 AM" value={notifications.quietHours} onChange={(v) => setNotification('quietHours', v)} />
          <NavRow label="All notification settings" onPress={() => router.push('/me/notifications')} />
        </SettingsGroup>
      ) : null}

      {voice ? (
        <SettingsGroup title="Voice">
          <SwitchRow label="Start with voice" sub="Typing is always one tap away" value={voice.voiceFirst} onChange={(v) => setVoice('voiceFirst', v)} />
          <SwitchRow label="Show live transcript" sub="See your words as you speak" value={voice.showTranscript} onChange={(v) => setVoice('showTranscript', v)} />
          <NavRow label="All voice settings" onPress={() => router.push('/me/voice')} />
        </SettingsGroup>
      ) : null}

      <SectionLabel>Privacy</SectionLabel>
      <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, borderRadius: radius.card, paddingHorizontal: 18, paddingTop: 16 }}>
        <Text variant="meta" color="muted" style={{ lineHeight: 22 }}>
          Nothing is recorded as your statement until you've seen what we understood and sent it yourself. You start and stop every recording.
        </Text>
        <View style={{ marginHorizontal: -18, marginTop: 6, borderTopWidth: 1, borderTopColor: c.line, paddingHorizontal: 18 }}>
          <NavRow label="How DutyGraph handles your answers" onPress={() => router.push('/me/privacy')} />
        </View>
      </View>

      <SectionLabel>Appearance</SectionLabel>
      <Segmented label="Appearance" options={APPEARANCE_OPTIONS} value={appearance} onChange={setAppearance} />
      <View style={{ marginTop: 10 }}>
        <Button label="Motion and text size" kind="link" onPress={() => router.push('/me/appearance')} />
      </View>

      <SectionLabel>Account</SectionLabel>
      <NavRow label="Run meetings for a company" onPress={() => router.push('/advisor/pair')} />
      <Button label="Sign out" onPress={confirmAndSignOut} full />
      <Text variant="small" color="faint" style={{ marginTop: 8 }}>
        To reconnect after signing out, you will need a new invitation link from your advisor.
      </Text>

      {repo.kind === 'mock' ? <DeveloperPanel /> : null}
    </Screen>
  );
}
