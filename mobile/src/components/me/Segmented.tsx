import React from 'react';
import { Pressable, View } from 'react-native';
import { radius, touch, useColors } from '@/theme';
import { Text } from '@/components/common';
import type { AppearancePreference } from '@/types/domain';

export const APPEARANCE_OPTIONS: { value: AppearancePreference; label: string }[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'System' },
];

export interface SegmentedProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}

/** Equal-width choice buttons (Dark / Light / System). */
export function Segmented<T extends string>({ options, value, onChange, label }: SegmentedProps<T>) {
  const c = useColors();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', gap: 8 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityState={{ selected: on, checked: on }}
            onPress={() => onChange(o.value)}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: touch.primary,
              borderRadius: radius.button,
              borderWidth: 1,
              borderColor: on ? c.accent : c.line,
              backgroundColor: on ? c.accentBg : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Text variant="buttonSecondary">{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
