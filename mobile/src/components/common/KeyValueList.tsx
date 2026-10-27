import React from 'react';
import { View } from 'react-native';
import { radius, useColors } from '@/theme';
import { Text } from './Text';

/** Label/value rows in a bordered group (commitment fields, meeting facts). */
export function KeyValueList({ rows }: { rows: { label: string; value: string }[] }) {
  const c = useColors();
  return (
    <View style={{ borderWidth: 1, borderColor: c.line, borderRadius: radius.card, backgroundColor: c.surface }}>
      {rows.map((r, i) => (
        <View key={r.label} style={{ paddingVertical: 14, paddingHorizontal: 18, borderTopWidth: i ? 1 : 0, borderTopColor: c.line }}>
          <Text variant="label" color="faint" style={{ marginBottom: 4 }}>
            {r.label}
          </Text>
          <Text variant="body">{r.value}</Text>
        </View>
      ))}
    </View>
  );
}
