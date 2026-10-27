import React from 'react';
import { View } from 'react-native';
import { radius, toneColors, useColors, type Tone } from '@/theme';
import { Text } from './Text';

/** Small factual status chip ("Due 10:30 AM", "Overdue"). Never a score. */
export function StatusChip({ label, tone = 'plain', dot }: { label: string; tone?: Tone; dot?: boolean }) {
  const c = useColors();
  const t = toneColors(c, tone);
  return (
    <View
      accessible
      accessibilityLabel={label}
      style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: t.bg, borderRadius: radius.chip, paddingHorizontal: 9, paddingVertical: 5, gap: 6 }}
    >
      {dot ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: t.fg }} /> : null}
      <Text variant="chip" style={{ color: t.fg }}>
        {label}
      </Text>
    </View>
  );
}
