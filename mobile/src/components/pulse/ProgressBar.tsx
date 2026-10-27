import React from 'react';
import { View } from 'react-native';
import { useColors } from '@/theme';

/** Factual completion bar (n of total). Decorative for screen readers; the count is spoken in text. */
export function ProgressBar({ fraction }: { fraction: number }) {
  const c = useColors();
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants" style={{ height: 4, borderRadius: 2, backgroundColor: c.soft, overflow: 'hidden' }}>
      <View style={{ height: '100%', width: `${Math.round(fraction * 100)}%`, borderRadius: 2, backgroundColor: c.accent }} />
    </View>
  );
}
