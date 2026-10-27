import React from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { radius, useColors } from '@/theme';
import { Text } from './Text';
import { BrandSymbol } from './BrandSymbol';

export interface TopBarProps {
  /** Show Back (flow screens). */
  onBack?: () => void;
  /** Show the notifications bell (tab screens). */
  onBell?: () => void;
  unread?: boolean;
}

/** App header: DutyGraph mark on the left; Back or the notifications bell on the right. */
export function TopBar({ onBack, onBell, unread }: TopBarProps) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        backgroundColor: c.nav,
        paddingTop: insets.top + 6,
        paddingBottom: 12,
        paddingHorizontal: 20,
        minHeight: 52,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottomWidth: 1,
        borderBottomColor: c.line,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }} accessible accessibilityRole="header" accessibilityLabel="DutyGraph">
        <BrandSymbol />
        <Text variant="brand">DutyGraph</Text>
      </View>
      {onBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={onBack}
          hitSlop={6}
          style={({ pressed }) => ({ minHeight: 36, paddingHorizontal: 12, borderRadius: radius.button, borderWidth: 1, borderColor: c.line, justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}
        >
          <Text variant="metaStrong">Back</Text>
        </Pressable>
      ) : onBell ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={unread ? 'Notifications, unread' : 'Notifications'}
          onPress={onBell}
          hitSlop={4}
          style={({ pressed }) => ({ width: 40, height: 40, borderRadius: radius.button, borderWidth: 1, borderColor: c.line, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}
        >
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={c.ink} strokeWidth={1.8} strokeLinejoin="round">
            <Path d="M6 16v-5a6 6 0 1 1 12 0v5l1.5 2h-15z" />
            <Path d="M10 20.5a2 2 0 0 0 4 0" />
          </Svg>
          {unread ? <View style={{ position: 'absolute', top: 7, right: 8, width: 7, height: 7, borderRadius: 4, backgroundColor: c.amber }} /> : null}
        </Pressable>
      ) : null}
    </View>
  );
}
