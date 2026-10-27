import React from 'react';
import { Pressable, View } from 'react-native';
import { radius, useColors } from '@/theme';
import { Text } from '@/components/common';
import type { ClarificationOption } from '@/types/domain';

export function StatementCard({ source, text }: { source: string; text: string }) {
  const c = useColors();
  return (
    <View accessible accessibilityLabel={`${source}: ${text}`} style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, borderRadius: radius.card, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 10 }}>
      <Text variant="small" color="faint" style={{ marginBottom: 4 }}>
        {source}
      </Text>
      <Text variant="body">{text}</Text>
    </View>
  );
}

/** Answer buttons. Options that need a short conversation use the outlined style. */
export function ClarificationOptions({ options, onPick, disabled, pendingId }: { options: ClarificationOption[]; onPick: (o: ClarificationOption) => void; disabled?: boolean; pendingId?: string }) {
  const c = useColors();
  return (
    <View style={{ gap: 8 }}>
      {options.map((o) => (
        <Pressable
          key={o.id}
          accessibilityRole="button"
          accessibilityLabel={o.label}
          accessibilityState={{ disabled: !!disabled, busy: pendingId === o.id }}
          disabled={disabled}
          onPress={() => onPick(o)}
          style={({ pressed }) => ({
            minHeight: 52,
            paddingHorizontal: 16,
            paddingVertical: 12,
            justifyContent: 'center',
            borderRadius: radius.button,
            borderWidth: 1,
            borderColor: c.line,
            backgroundColor: o.opensConversation ? 'transparent' : c.raised,
            opacity: disabled && pendingId !== o.id ? 0.55 : pressed ? 0.85 : 1,
          })}
        >
          <Text variant="bodyStrong" style={{ fontWeight: '500' }}>
            {o.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Sage confirmation shown once the answer is recorded (or was already). */
export function ResolvedCard({ headline, body }: { headline: string; body?: string }) {
  const c = useColors();
  return (
    <View accessibilityLiveRegion="polite" style={{ backgroundColor: c.sageBg, borderWidth: 1, borderColor: c.line, borderRadius: radius.card, paddingVertical: 14, paddingHorizontal: 16 }}>
      <Text variant="bodyStrong" color="sage" style={{ marginBottom: body ? 4 : 0 }}>
        {headline}
      </Text>
      {body ? <Text variant="body" color="muted">{body}</Text> : null}
    </View>
  );
}
