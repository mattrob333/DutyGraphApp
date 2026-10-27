import React from 'react';
import { View } from 'react-native';
import { radius, useColors } from '@/theme';
import { Text } from '@/components/common';

export interface LiveTranscriptProps {
  /** "Listening…" | "Paused" | "Transcribing…" — recording state in words, not only color. */
  label: string;
  text: string;
  /** Shown while nothing has been heard yet. */
  emptyHint?: string;
}

/** Dashed box under the question showing what DutyGraph is hearing (03-Voice.png). */
export function LiveTranscript({ label, text, emptyHint = 'Go ahead — your words will appear here.' }: LiveTranscriptProps) {
  const c = useColors();
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{ marginTop: 14, marginLeft: 28, borderWidth: 1, borderStyle: 'dashed', borderColor: c.line, borderRadius: radius.card, paddingVertical: 12, paddingHorizontal: 14, minHeight: 84 }}
    >
      <Text variant="label" color="faint" style={{ marginBottom: 6 }}>
        {label}
      </Text>
      {text ? (
        <Text variant="body">{text}</Text>
      ) : (
        <Text variant="meta" color="faint">
          {emptyHint}
        </Text>
      )}
    </View>
  );
}
