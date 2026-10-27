import React from 'react';
import { Pressable, View } from 'react-native';
import { radius, useColors } from '@/theme';
import { Text } from '@/components/common';
import type { ChangeKind, ChangeKindOption } from '@/types/domain';

/** Radio-style list of change kinds. Nothing is selected by default; choosing is optional. */
export function ChangeKindList({ options, selected, onSelect }: { options: ChangeKindOption[]; selected?: ChangeKind; onSelect: (k: ChangeKind) => void }) {
  const c = useColors();
  return (
    <View accessibilityRole="radiogroup" style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, borderRadius: radius.card, paddingHorizontal: 18 }}>
      {options.map((o, i) => {
        const on = o.kind === selected;
        return (
          <Pressable
            key={o.kind}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityState={{ checked: on, selected: on }}
            onPress={() => onSelect(o.kind)}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: c.line, opacity: pressed ? 0.8 : 1 })}
          >
            <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: on ? c.ink : c.faint, alignItems: 'center', justifyContent: 'center' }}>
              {on ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.ink }} /> : null}
            </View>
            <Text variant="body" style={{ flex: 1, fontSize: 15 }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
