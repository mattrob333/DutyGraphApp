import React from 'react';
import { View } from 'react-native';
import { radius, useColors } from '@/theme';
import { Text } from '@/components/common';

/** Label left, value right, hairline between (Discovery facts card). */
export function FactRows({ rows }: { rows: { label: string; value: string }[] }) {
  const c = useColors();
  return (
    <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, borderRadius: radius.card, paddingHorizontal: 18 }}>
      {rows.map((r, i) => (
        <View
          key={r.label}
          accessible
          accessibilityLabel={`${r.label}: ${r.value}`}
          style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingVertical: 14, borderTopWidth: i ? 1 : 0, borderTopColor: c.line }}
        >
          <Text variant="meta" color="faint">
            {r.label}
          </Text>
          <Text variant="metaStrong" style={{ flexShrink: 1, textAlign: 'right' }}>
            {r.value}
          </Text>
        </View>
      ))}
    </View>
  );
}
