import React from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { radius, useColors } from '@/theme';
import { Text } from '@/components/common';

/** "You're offline…" (hf-16): answers stay on the phone and are sent later. */
export function OfflineNotice({ style }: { style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[{ flexDirection: 'row', gap: 9, alignItems: 'flex-start', backgroundColor: c.amberBg, borderRadius: radius.card, paddingVertical: 11, paddingHorizontal: 14 }, style]}
    >
      <View style={{ width: 7, height: 7, marginTop: 6, borderRadius: 4, backgroundColor: c.amber }} />
      <Text variant="small" style={{ flex: 1, color: c.amber, fontSize: 13, lineHeight: 19.5 }}>
        You're offline. Your answers are saved on this phone and will be sent when you're back online.
      </Text>
    </View>
  );
}

/** "We couldn't hear that." (hf-17) with Try again and Type instead. */
export function SpeechErrorNotice({ onRetry, onType, style }: { onRetry: () => void; onType: () => void; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return (
    <View accessibilityLiveRegion="assertive" style={[{ backgroundColor: c.redBg, borderWidth: 1, borderColor: c.line, borderRadius: radius.card, paddingVertical: 14, paddingHorizontal: 16 }, style]}>
      <View style={{ flexDirection: 'row', gap: 9, alignItems: 'flex-start', marginBottom: 12 }}>
        <View style={{ width: 7, height: 7, marginTop: 8, borderRadius: 4, backgroundColor: c.red }} />
        <Text variant="bodyStrong" color="red" style={{ flex: 1, fontSize: 15, lineHeight: 21.75 }}>
          We couldn't hear that. Try again or type instead.
        </Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Try again"
          onPress={onRetry}
          style={({ pressed }) => ({ flex: 1, minHeight: 44, borderRadius: radius.button, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}
        >
          <Text variant="button" color="primaryInk" style={{ fontSize: 15 }}>
            Try again
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Type instead"
          onPress={onType}
          style={({ pressed }) => ({ flex: 1, minHeight: 44, borderRadius: radius.button, borderWidth: 1, borderColor: c.line, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}
        >
          <Text variant="buttonSecondary">Type instead</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** "Not sent yet" (hf-22) on the review after a failed send. */
export function SendFailedNotice({ message, style }: { message?: string; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return (
    <View accessibilityLiveRegion="assertive" style={[{ backgroundColor: c.redBg, borderWidth: 1, borderColor: c.line, borderRadius: radius.card, paddingVertical: 14, paddingHorizontal: 16 }, style]}>
      <View style={{ flexDirection: 'row', gap: 9, alignItems: 'center', marginBottom: 6 }}>
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.red }} />
        <Text variant="bodyStrong" color="red" style={{ fontSize: 15, lineHeight: 21 }}>
          Not sent yet
        </Text>
      </View>
      <Text variant="body" color="muted" style={{ fontSize: 15, lineHeight: 22.5 }}>
        {message || 'Your answers are safe on this phone.'}
      </Text>
    </View>
  );
}

/** Web: the prototype's visually hidden role="status" region for announcements (native announces directly). */
export function LiveRegion({ text }: { text: string }) {
  return (
    <View accessibilityLiveRegion="polite" role="status" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0 }}>
      <Text>{text}</Text>
    </View>
  );
}
