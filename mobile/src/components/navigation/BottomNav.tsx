import React from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { radius, useColors } from '@/theme';
import { Text } from '@/components/common';
import { visibleTabs } from '@/features/today/scope';

const LABELS: Record<string, string> = { today: 'Today', work: 'Work', meetings: 'Meetings', me: 'Me' };

/**
 * Bottom navigation from the prototype: text tabs, the active one on an accent pill. Four with the
 * full app; Today and Me with the `questions` scope (spec §6.1).
 */
export function BottomNav({ state, navigation }: BottomTabBarProps) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const tabs: string[] = visibleTabs();
  return (
    <View
      accessibilityRole="tablist"
      style={{ flexDirection: 'row', backgroundColor: c.nav, borderTopWidth: 1, borderTopColor: c.line, paddingHorizontal: 20, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 12), gap: 4 }}
    >
      {state.routes.map((route, index) => {
        if (!tabs.includes(route.name)) return null;
        const focused = state.index === index;
        const label = LABELS[route.name] ?? route.name;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={label}
            onPress={() => {
              const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !e.defaultPrevented) navigation.navigate(route.name);
            }}
            style={{ flex: 1, minHeight: 48, borderRadius: radius.button + 1, alignItems: 'center', justifyContent: 'center', backgroundColor: focused ? c.accentBg : 'transparent' }}
          >
            <Text variant="buttonSecondary" style={{ color: focused ? c.ink : c.muted }}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
