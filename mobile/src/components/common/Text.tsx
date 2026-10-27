import React from 'react';
import { Text as RNText, type TextProps, type TextStyle } from 'react-native';
import { typography, useColors, type ColorTokens } from '@/theme';

export type TextVariant = keyof typeof typography;
export type TextColor = keyof Pick<ColorTokens, 'ink' | 'muted' | 'faint' | 'sage' | 'amber' | 'violet' | 'red' | 'primaryInk' | 'accent'>;

export interface AppTextProps extends TextProps {
  variant?: TextVariant;
  color?: TextColor;
  align?: TextStyle['textAlign'];
}

/** Themed text. Respects system font scaling (PRD 28), capped to keep layouts usable. */
export function Text({ variant = 'body', color = 'ink', align, style, ...rest }: AppTextProps) {
  const c = useColors();
  return (
    <RNText
      maxFontSizeMultiplier={1.8}
      {...rest}
      style={[typography[variant] as TextStyle, { color: c[color] }, align ? { textAlign: align } : null, style]}
    />
  );
}

export function Heading({ children, style, ...rest }: AppTextProps) {
  return (
    <Text variant="display" accessibilityRole="header" style={[{ marginTop: 4, marginBottom: 14 }, style]} {...rest}>
      {children}
    </Text>
  );
}

/** Uppercase section label ("DUE NOW"). */
export function SectionLabel({ children, style, ...rest }: AppTextProps) {
  return (
    <Text variant="label" color="faint" accessibilityRole="header" style={[{ marginTop: 22, marginBottom: 10 }, style]} {...rest}>
      {children}
    </Text>
  );
}
