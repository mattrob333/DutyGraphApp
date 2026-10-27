import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { radius, touch, useColors } from '@/theme';
import { Text } from './Text';

type Kind = 'primary' | 'secondary' | 'ghost' | 'link';

export interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  label: string;
  kind?: Kind;
  /** Stretch to container width. Primary buttons default to full width. */
  full?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  haptic?: boolean;
}

export function Button({ label, kind = 'secondary', full, loading, disabled, style, onPress, haptic, ...rest }: ButtonProps) {
  const c = useColors();
  const isFull = full ?? kind === 'primary';
  const inactive = disabled || loading;
  const base: ViewStyle =
    kind === 'primary'
      ? { backgroundColor: c.primary, minHeight: touch.primary, borderRadius: radius.button }
      : kind === 'secondary'
        ? { borderWidth: 1, borderColor: c.line, minHeight: touch.min, borderRadius: radius.button }
        : kind === 'ghost'
          ? { minHeight: touch.min, borderRadius: radius.button }
          : { minHeight: touch.min };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={(e) => {
        if (haptic) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress?.(e);
      }}
      style={({ pressed }) => [
        styles.base,
        base,
        isFull ? styles.full : styles.inline,
        { opacity: inactive ? 0.55 : pressed ? 0.8 : 1 },
        style,
      ]}
      {...rest}
    >
      <View style={styles.row}>
        {loading ? <ActivityIndicator size="small" color={kind === 'primary' ? c.primaryInk : c.ink} style={{ marginRight: 8 }} /> : null}
        <Text
          variant={kind === 'primary' ? 'button' : 'buttonSecondary'}
          color={kind === 'primary' ? 'primaryInk' : kind === 'link' ? 'muted' : 'ink'}
          style={kind === 'link' ? { textDecorationLine: 'underline' } : undefined}
          numberOfLines={2}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { justifyContent: 'center', alignItems: 'center' },
  full: { alignSelf: 'stretch', paddingHorizontal: 16 },
  inline: { alignSelf: 'flex-start', paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center' },
});
