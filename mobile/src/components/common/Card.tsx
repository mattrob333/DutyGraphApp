import React from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { radius, spacing, toneColors, useColors, type Tone } from '@/theme';

export interface CardProps {
  children: React.ReactNode;
  /** raised = primary emphasis (Due now); surface = secondary (Later). */
  level?: 'raised' | 'surface';
  tone?: Tone;
  dashed?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export function Card({ children, level = 'raised', tone, dashed, onPress, accessibilityLabel, style }: CardProps) {
  const c = useColors();
  const bg = tone && tone !== 'plain' ? toneColors(c, tone).bg : level === 'raised' ? c.raised : c.surface;
  const s: ViewStyle = {
    backgroundColor: bg,
    borderWidth: 1,
    borderStyle: dashed ? 'dashed' : 'solid',
    borderColor: c.line,
    borderRadius: radius.card,
    paddingVertical: spacing.cardV,
    paddingHorizontal: spacing.cardH,
    marginBottom: spacing.md,
  };
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={({ pressed }) => [s, { opacity: pressed ? 0.85 : 1 }, style]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[s, style]}>{children}</View>;
}
