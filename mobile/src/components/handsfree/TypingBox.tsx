import React, { useState } from 'react';
import { Platform, TextInput, View } from 'react-native';
import { fontFamily, radius, useColors } from '@/theme';
import { Text } from '@/components/common';

export interface TypingBoxProps {
  value: string;
  onChange: (text: string) => void;
  /** Why voice is off: the note above the box (hf-14). Null when the person chose to type. */
  blocked?: 'permission' | 'unavailable' | null;
}

/** Typing mode (hf-14, hf-15): the answer box, with a note when the microphone is blocked. */
export function TypingBox({ value, onChange, blocked }: TypingBoxProps) {
  const c = useColors();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ marginTop: 2, marginHorizontal: 20 }}>
      {blocked ? (
        <View accessibilityLiveRegion="polite" style={{ marginBottom: 10, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, borderRadius: radius.card, paddingVertical: 12, paddingHorizontal: 14 }}>
          <Text variant="meta" color="muted" style={{ lineHeight: 21 }}>
            <Text variant="meta" style={{ fontFamily: fontFamily.semibold, lineHeight: 21 }}>
              {blocked === 'permission' ? 'Your microphone is blocked.' : "Voice answers aren't available on this phone."}
            </Text>{' '}
            You can type your answers instead. Same cards, same review.
          </Text>
        </View>
      ) : null}
      <TextInput
        accessibilityLabel="Your answer"
        value={value}
        onChangeText={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        multiline
        placeholder="Type your answer…"
        placeholderTextColor={c.faint}
        textAlignVertical="top"
        maxFontSizeMultiplier={1.8}
        style={{
          minHeight: 120,
          borderRadius: radius.card,
          borderWidth: 1,
          // Focus shows on the border (the web's own outline is off, as in hf-15).
          borderColor: focused ? c.focus : c.line,
          ...(Platform.OS === 'web' ? { outlineStyle: 'none' as never } : null),
          backgroundColor: c.raised,
          color: c.ink,
          paddingVertical: 12,
          paddingHorizontal: 14,
          fontFamily: fontFamily.regular,
          fontSize: 16,
          lineHeight: 24,
        }}
      />
    </View>
  );
}
