import React from 'react';
import { View } from 'react-native';
import { radius, useColors } from '@/theme';
import { Text } from '@/components/common';

export interface Fact {
  label: string;
  value: string;
  /** Render label and value on one row (Estimated time). */
  inline?: boolean;
}

/** Label/value facts in one bordered group (prototype "required" card). */
export function FactList({ facts }: { facts: Fact[] }) {
  const c = useColors();
  return (
    <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, borderRadius: radius.card, paddingHorizontal: 18 }}>
      {facts.map((f, i) => (
        <View
          key={f.label}
          accessible
          accessibilityLabel={`${f.label}: ${f.value}`}
          style={{
            paddingVertical: 13,
            borderTopWidth: i ? 1 : 0,
            borderTopColor: c.line,
            flexDirection: f.inline ? 'row' : 'column',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <Text variant="label" color="faint" style={f.inline ? undefined : { marginBottom: 4 }}>
            {f.label}
          </Text>
          <Text variant={f.inline ? 'metaStrong' : 'body'} style={{ fontSize: 15, lineHeight: 22, flexShrink: 1 }}>
            {f.value}
          </Text>
        </View>
      ))}
    </View>
  );
}
