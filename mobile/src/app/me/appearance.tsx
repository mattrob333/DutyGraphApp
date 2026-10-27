import React from 'react';
import { Heading, Screen, Text } from '@/components/common';
import { APPEARANCE_OPTIONS, Segmented, SettingsGroup, SwitchRow } from '@/components/me';
import { usePreferencesStore } from '@/state/preferences';

export default function AppearanceSettings() {
  const appearance = usePreferencesStore((s) => s.appearance);
  const setAppearance = usePreferencesStore((s) => s.setAppearance);
  const reduceMotion = usePreferencesStore((s) => s.reduceMotion);
  const setReduceMotion = usePreferencesStore((s) => s.setReduceMotion);

  return (
    <Screen>
      <Heading>Appearance</Heading>
      <Text color="muted" style={{ marginBottom: 18 }}>
        This only changes this phone. System follows your phone's light or dark setting.
      </Text>
      <Segmented label="Appearance" options={APPEARANCE_OPTIONS} value={appearance} onChange={setAppearance} />
      <SettingsGroup title="Motion">
        <SwitchRow label="Reduce motion" sub="Fewer animations, in addition to your phone's setting" value={reduceMotion} onChange={setReduceMotion} />
      </SettingsGroup>
      <Text variant="small" color="faint" style={{ marginTop: 10 }}>
        Text size follows your phone's font size setting.
      </Text>
    </Screen>
  );
}
