import React from 'react';
import { Linking, Platform } from 'react-native';
import { Button, Card, ErrorState, Heading, LoadingState, Screen, Text } from '@/components/common';
import { SettingsGroup, SwitchRow } from '@/components/me';
import { usePreferenceToggles } from '@/features/profile/usePreferenceToggles';

export default function VoiceSettings() {
  const { me, voice, setVoice } = usePreferenceToggles();
  if (me.isLoading) return <LoadingState />;
  if (me.isError || !voice) return <ErrorState error={me.error} onRetry={() => me.refetch()} />;

  return (
    <Screen>
      <Heading>Voice</Heading>
      <Text color="muted" style={{ marginBottom: 6 }}>
        You can always type instead. Nothing counts as your answer until you have reviewed and sent it.
      </Text>
      <SettingsGroup title="Answering">
        <SwitchRow label="Start with voice" sub="Typing is always one tap away" value={voice.voiceFirst} onChange={(v) => setVoice('voiceFirst', v)} />
        <SwitchRow label="Show live transcript" sub="See your words as you speak" value={voice.showTranscript} onChange={(v) => setVoice('showTranscript', v)} />
        <SwitchRow label="Read questions aloud" sub="Hear each question before you answer" value={voice.speakQuestions} onChange={(v) => setVoice('speakQuestions', v)} />
      </SettingsGroup>

      <Card level="surface" style={{ marginTop: 24 }}>
        <Text variant="bodyStrong" style={{ marginBottom: 4 }}>
          Microphone
        </Text>
        <Text variant="meta" color="muted">
          DutyGraph uses the microphone only while you are answering, after you tap to start. If it is blocked, you can keep typing, or allow it in your phone settings.
        </Text>
        {Platform.OS !== 'web' ? <Button label="Open phone settings" onPress={() => Linking.openSettings()} style={{ marginTop: 12 }} /> : null}
      </Card>
    </Screen>
  );
}
