import React from 'react';
import { View } from 'react-native';
import { radius, useColors } from '@/theme';
import { Text } from '@/components/common';

const DOT = ['sage', 'amber', 'faint', 'faint'] as const;

/** Card with a title and bullets or a numbered list (pre-meeting brief). */
export function ListCard({ title, items, numbered, level = 'surface', bulletTones }: { title: string; items: string[]; numbered?: boolean; level?: 'surface' | 'raised'; bulletTones?: boolean }) {
  const c = useColors();
  return (
    <View
      accessibilityRole="summary"
      style={{ backgroundColor: level === 'raised' ? c.raised : c.surface, borderWidth: 1, borderColor: c.line, borderRadius: radius.card, paddingVertical: 16, paddingHorizontal: 18, marginBottom: 12 }}
    >
      <Text variant="bodyStrong" accessibilityRole="header" style={{ fontSize: 15, lineHeight: 21, marginBottom: 10 }}>
        {title}
      </Text>
      <View style={{ gap: numbered ? 10 : 8 }}>
        {items.map((t, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
            {numbered ? (
              <Text variant="body" color="faint" style={{ width: 16, fontSize: 15, lineHeight: 22 }}>
                {i + 1}
              </Text>
            ) : (
              <View
                style={{ width: 6, height: 6, marginTop: 8, borderRadius: 3, backgroundColor: bulletTones ? c[DOT[i % DOT.length]] : c.faint }}
              />
            )}
            <Text variant="body" color={numbered ? 'ink' : 'muted'} style={{ flex: 1, fontSize: 15, lineHeight: 22 }}>
              {t}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
