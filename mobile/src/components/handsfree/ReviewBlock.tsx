import React, { useState } from 'react';
import { Platform, Pressable, TextInput, View } from 'react-native';
import { fontFamily, radius, useColors } from '@/theme';
import { Text } from '@/components/common';
import { SkipArrowIcon } from './icons';

export type ReviewBlockProps =
  | {
      kind: 'answered';
      title: string;
      /** The polished text, the person's edit, or their own words when nothing was polished. */
      value: string;
      onChange: (text: string) => void;
      /** The person's own words, under "Show what I said". */
      raw: string;
      /** "A note for later" (at most one on the page). */
      note?: string | null;
    }
  | { kind: 'skipped'; title: string; reason: string };

/** One answer on "Here's what we heard" (hf-19): editable, with the person's own words one tap away. */
export function ReviewBlock(p: ReviewBlockProps) {
  const c = useColors();
  return (
    <View style={{ backgroundColor: c.raised, borderWidth: 1, borderColor: c.line, borderRadius: radius.card, paddingVertical: 16, paddingHorizontal: 18, marginBottom: 12 }}>
      <Text variant="bodyStrong" accessibilityRole="header" style={{ fontSize: 15, lineHeight: 21, marginBottom: 10 }}>
        {p.title}
      </Text>
      {p.kind === 'answered' ? (
        <Answered {...p} />
      ) : (
        <View accessible accessibilityLabel={p.reason} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <SkipArrowIcon size={14} color={c.muted} />
          <Text variant="metaStrong" color="muted" style={{ fontSize: 15, lineHeight: 21 }}>
            {p.reason}
          </Text>
        </View>
      )}
    </View>
  );
}

function Answered({ title, value, onChange, raw, note }: Extract<ReviewBlockProps, { kind: 'answered' }>) {
  const c = useColors();
  const [showRaw, setShowRaw] = useState(false);
  const [focused, setFocused] = useState(false);
  const [contentH, setContentH] = useState(0);
  // The prototype sizes the box to its text (about 34 characters a line). Native also grows with
  // the measured text; the web's measurement includes the box itself, so it would grow forever.
  const rows = Math.max(2, Math.ceil(value.length / 34));
  const minHeight = Math.max(rows * 24.8 + 22, contentH + 22);
  const measure = Platform.OS !== 'web';
  return (
    <>
      <TextInput
        accessibilityLabel={`Your answer to: ${title.trim().replace(/[.?!]+$/, '')}. Editable`}
        value={value}
        onChangeText={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        multiline
        scrollEnabled={false}
        textAlignVertical="top"
        maxFontSizeMultiplier={1.8}
        onContentSizeChange={measure ? (e) => setContentH(Math.round(e.nativeEvent.contentSize.height)) : undefined}
        style={{
          minHeight,
          borderRadius: radius.button,
          borderWidth: 1,
          borderColor: focused ? c.focus : c.line,
          ...(Platform.OS === 'web' ? { outlineStyle: 'none' as never } : null),
          backgroundColor: c.surface,
          color: c.ink,
          paddingVertical: 10,
          paddingHorizontal: 12,
          fontFamily: fontFamily.regular,
          fontSize: 16,
          lineHeight: 24.8,
        }}
      />
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: showRaw }} onPress={() => setShowRaw((v) => !v)} style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}>
        <Text variant="metaStrong" color="muted" style={{ textDecorationLine: 'underline', lineHeight: 18 }}>
          {showRaw ? 'Hide what I said' : 'Show what I said'}
        </Text>
      </Pressable>
      {showRaw ? (
        <View style={{ backgroundColor: c.surface, borderRadius: radius.button, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 6 }}>
          <Text variant="chip" color="faint" style={{ letterSpacing: 0.72, marginBottom: 4 }}>
            Your words
          </Text>
          <Text variant="body" color="muted" style={{ fontSize: 15, lineHeight: 23 }}>
            {raw.trim() || '—'}
          </Text>
        </View>
      ) : null}
      {note ? (
        <View style={{ borderTopWidth: 1, borderTopColor: c.line, marginTop: 6, paddingTop: 12 }}>
          <Text variant="chip" color="faint" style={{ letterSpacing: 0.72, marginBottom: 4 }}>
            A note for later
          </Text>
          <Text variant="body" color="muted" style={{ fontSize: 15, lineHeight: 22.5 }}>
            {note}
          </Text>
        </View>
      ) : null}
    </>
  );
}
