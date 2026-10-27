import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, useColors } from '@/theme';

/** Sticky action area at the bottom of flow screens (Start with voice / Type instead). */
export function BottomActionBar({ children }: { children: React.ReactNode }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        backgroundColor: c.nav,
        borderTopWidth: 1,
        borderTopColor: c.line,
        paddingHorizontal: spacing.gutter,
        paddingTop: 14,
        paddingBottom: Math.max(insets.bottom, 14),
        gap: 10,
      }}
    >
      {children}
    </View>
  );
}
