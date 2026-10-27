import React from 'react';
import { Pressable } from 'react-native';
import { radius, useColors } from '@/theme';
import { Text } from '@/components/common';

/** Dashed "Add something we missed" affordance under the cards (05-Understood-b.png). */
export function AddItemButton({ onPress }: { onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Add something we missed"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 48,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.card,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: c.line,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Text variant="buttonSecondary" color="muted">
        Add something we missed
      </Text>
    </Pressable>
  );
}
