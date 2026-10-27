import React from 'react';
import { View } from 'react-native';
import { Text } from '@/components/common';

/** Kicker label, headline and reason shared by the meeting outcome screens. */
export function MeetingHero({ kicker, headline, reason, subtitle }: { kicker?: string; headline: string; reason?: string; subtitle?: string }) {
  return (
    <View>
      {kicker ? (
        <Text variant="label" color="faint">
          {kicker}
        </Text>
      ) : null}
      <Text variant="display" accessibilityRole="header" style={{ fontSize: 30, lineHeight: 36, letterSpacing: -0.9, marginTop: 10, marginBottom: subtitle ? 6 : 12 }}>
        {headline}
      </Text>
      {subtitle ? (
        <Text variant="cardTitle" style={{ fontSize: 18, marginBottom: 12 }}>
          {subtitle}
        </Text>
      ) : null}
      {reason ? (
        <Text variant="body" color="muted" style={{ lineHeight: 25, marginBottom: 24 }}>
          {reason}
        </Text>
      ) : null}
    </View>
  );
}
