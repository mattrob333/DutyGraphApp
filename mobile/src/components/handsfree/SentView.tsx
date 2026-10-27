import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';
import { radius, useColors } from '@/theme';
import { Text } from '@/components/common';
import { nativeDriver } from './anim';
import { CheckIcon } from './icons';

/** "You're done." (hf-21), shown only after the server acknowledged the send. */
export function SentView({ title, wentTo, took }: { title: string; wentTo: string; took?: string | null }) {
  const c = useColors();
  return (
    <View accessibilityLiveRegion="polite" style={{ paddingTop: 64, paddingHorizontal: 20, paddingBottom: 28, alignItems: 'center' }}>
      <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: c.sageBg, alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
        <CheckIcon size={38} color={c.sage} stroke={2.4} />
      </View>
      <Text variant="display" accessibilityRole="header" align="center" style={{ lineHeight: 35, marginBottom: 12 }}>
        {title}
      </Text>
      <Text variant="body" color="muted" align="center" style={{ lineHeight: 24.8, marginBottom: 4 }}>
        {wentTo}
      </Text>
      {took ? (
        <Text variant="body" color="faint" align="center" style={{ fontSize: 15, lineHeight: 23 }}>
          {took}
        </Text>
      ) : null}
    </View>
  );
}

export interface SendButtonProps {
  label: string;
  sending: boolean;
  /** The server acknowledged: the fill completes before the screen changes. */
  done?: boolean;
  onPress: () => void;
  disabled?: boolean;
}

/**
 * Send with progress (hf-20): while sending the label reads "Sending…" and a light fill moves
 * across the button. The fill only completes when the server has answered.
 */
export function SendButton({ label, sending, done, onPress, disabled }: SendButtonProps) {
  const c = useColors();
  const fill = useRef(new Animated.Value(0)).current;
  const [w, setW] = React.useState(0);
  useEffect(() => {
    if (done) {
      const a = Animated.timing(fill, { toValue: 1, duration: 300, easing: Easing.out(Easing.ease), useNativeDriver: nativeDriver });
      a.start();
      return () => a.stop();
    }
    if (!sending) {
      fill.setValue(0);
      return;
    }
    fill.setValue(0.06);
    const a = Animated.timing(fill, { toValue: 0.85, duration: 1600, easing: Easing.bezier(0.2, 0.7, 0.3, 1), useNativeDriver: nativeDriver });
    a.start();
    return () => a.stop();
  }, [sending, done, fill]);
  const busy = sending || !!done;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={busy ? 'Sending' : label}
      accessibilityState={{ busy, disabled: busy || !!disabled }}
      disabled={busy || disabled}
      onPress={onPress}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={({ pressed }) => ({ minHeight: 48, borderRadius: radius.button, backgroundColor: c.primary, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.55 : pressed ? 0.85 : 1 })}
    >
      {busy ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: w,
            backgroundColor: c.primaryInk,
            opacity: 0.16,
            transform: [{ translateX: fill.interpolate({ inputRange: [0, 1], outputRange: [-w, 0] }) }],
          }}
        />
      ) : null}
      <Text variant="button" color="primaryInk">
        {busy ? 'Sending…' : label}
      </Text>
    </Pressable>
  );
}
