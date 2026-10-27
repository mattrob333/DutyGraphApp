import React from 'react';
import { Pressable, Switch, View } from 'react-native';
import { radius, touch, useColors } from '@/theme';
import { SectionLabel, Text } from '@/components/common';

/** Titled card holding rows separated by hairlines (prototype prefGroups). */
export function SettingsGroup({ title, children }: { title?: string; children: React.ReactNode }) {
  const c = useColors();
  const rows = React.Children.toArray(children).filter(Boolean);
  return (
    <View>
      {title ? <SectionLabel style={{ marginTop: 24 }}>{title}</SectionLabel> : null}
      <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, borderRadius: radius.card, paddingHorizontal: 18, overflow: 'hidden' }}>
        {rows.map((row, i) => (
          <View key={i} style={i > 0 ? { borderTopWidth: 1, borderTopColor: c.line } : undefined}>
            {row}
          </View>
        ))}
      </View>
    </View>
  );
}

export interface SwitchRowProps {
  label: string;
  sub?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}

export function SwitchRow({ label, sub, value, onChange, disabled }: SwitchRowProps) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={sub ? `${label}. ${sub}` : label}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14, paddingVertical: 13, minHeight: 58, opacity: disabled ? 0.55 : pressed ? 0.8 : 1 })}
    >
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong" style={{ fontSize: 15, lineHeight: 21 }}>
          {label}
        </Text>
        {sub ? (
          <Text variant="small" color="faint">
            {sub}
          </Text>
        ) : null}
      </View>
      <Switch
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ false: c.line, true: c.primary }}
        thumbColor={value ? c.primaryInk : c.muted}
        ios_backgroundColor={c.line}
      />
    </Pressable>
  );
}

/** Row that opens a sub-page. */
export function NavRow({ label, sub, onPress }: { label: string; sub?: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={sub ? `${label}. ${sub}` : label}
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14, paddingVertical: 12, minHeight: touch.min + 8, opacity: pressed ? 0.8 : 1 })}
    >
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong" style={{ fontSize: 15, lineHeight: 21 }}>
          {label}
        </Text>
        {sub ? (
          <Text variant="small" color="faint">
            {sub}
          </Text>
        ) : null}
      </View>
      <Text color="faint" accessibilityElementsHidden importantForAccessibility="no">
        ›
      </Text>
    </Pressable>
  );
}
