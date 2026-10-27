import React from 'react';
import { TextInput, View } from 'react-native';
import { fontFamily, radius, useColors } from '@/theme';
import { Button } from '@/components/common';

export interface TextComposerProps {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  /** Hidden when voice is not offered (e.g. microphone blocked). */
  onUseVoice?: () => void;
  /** Label for the voice button ("Record again" when reviewing a transcript). */
  voiceLabel?: string;
  voiceAccessibilityLabel?: string;
  sendLabel?: string;
  sendDisabled?: boolean;
  editable?: boolean;
  placeholder?: string;
  accessibilityLabel?: string;
}

/** Typed-answer composer: multiline input, "Send answer", "Use voice instead". */
export function TextComposer({
  value,
  onChange,
  onSend,
  onUseVoice,
  voiceLabel = 'Use voice',
  voiceAccessibilityLabel = 'Use voice instead',
  sendLabel = 'Send answer',
  sendDisabled,
  editable = true,
  placeholder = 'Type your answer…',
  accessibilityLabel = 'Your answer',
}: TextComposerProps) {
  const c = useColors();
  return (
    <View>
      <TextInput
        value={value}
        onChangeText={onChange}
        editable={editable}
        multiline
        numberOfLines={3}
        placeholder={placeholder}
        placeholderTextColor={c.faint}
        accessibilityLabel={accessibilityLabel}
        textAlignVertical="top"
        style={{
          minHeight: 84,
          maxHeight: 160,
          borderRadius: radius.button,
          borderWidth: 1,
          borderColor: c.line,
          backgroundColor: c.raised,
          color: c.ink,
          paddingHorizontal: 14,
          paddingVertical: 12,
          fontFamily: fontFamily.regular,
          fontSize: 16,
          lineHeight: 24,
        }}
      />
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
        {onUseVoice ? (
          <Button label={voiceLabel} accessibilityLabel={voiceAccessibilityLabel} onPress={onUseVoice} style={{ width: 104, minHeight: 48 }} />
        ) : null}
        <Button label={sendLabel} kind="primary" onPress={onSend} disabled={sendDisabled} style={{ flex: 1 }} />
      </View>
    </View>
  );
}
