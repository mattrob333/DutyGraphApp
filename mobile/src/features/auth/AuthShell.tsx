import React from 'react';
import { View } from 'react-native';
import { Screen, TopBar } from '@/components/common';
import { useColors } from '@/theme';

/** Header mark + page for pre-sign-in screens. Footer holds the BottomActionBar. */
export function AuthShell({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) {
  const c = useColors();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <TopBar />
      <Screen footer={footer}>{children}</Screen>
    </View>
  );
}
