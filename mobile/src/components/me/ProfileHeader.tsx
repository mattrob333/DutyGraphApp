import React from 'react';
import { View } from 'react-native';
import { Card, Text } from '@/components/common';
import { useColors } from '@/theme';
import { initials } from '@/features/profile/format';

export function ProfileHeader({ displayName, subtitle }: { displayName: string; subtitle?: string }) {
  const c = useColors();
  return (
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 0 }}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.accentBg, alignItems: 'center', justifyContent: 'center' }}
      >
        <Text variant="bodyStrong" style={{ fontSize: 15 }}>
          {initials(displayName)}
        </Text>
      </View>
      <View style={{ flex: 1 }} accessible accessibilityLabel={subtitle ? `${displayName}, ${subtitle}` : displayName}>
        <Text variant="bodyStrong">{displayName}</Text>
        {subtitle ? (
          <Text variant="meta" color="muted">
            {subtitle}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}
