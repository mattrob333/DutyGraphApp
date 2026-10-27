import React from 'react';
import { View } from 'react-native';
import { radius, toneColors, useColors, type Tone } from '@/theme';
import { Text } from '@/components/common';

/** Inline status panel: amber "No connection", red "Microphone is blocked" / "Couldn't send". Announced to screen readers. */
export function StatusPanel({ tone, title, body, assertive }: { tone: Extract<Tone, 'amber' | 'red' | 'sage' | 'violet'>; title: string; body: string; assertive?: boolean }) {
  const c = useColors();
  const t = toneColors(c, tone);
  return (
    <View
      accessible
      accessibilityLabel={`${title}. ${body}`}
      accessibilityLiveRegion={assertive ? 'assertive' : 'polite'}
      style={{ backgroundColor: t.bg, borderWidth: 1, borderColor: c.line, borderRadius: radius.card, paddingVertical: 14, paddingHorizontal: 16 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 6 }}>
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: t.fg }} />
        <Text variant="bodyStrong" style={{ color: t.fg, fontSize: 15 }}>
          {title}
        </Text>
      </View>
      <Text variant="meta" color="muted" style={{ fontSize: 15, lineHeight: 22 }}>
        {body}
      </Text>
    </View>
  );
}
