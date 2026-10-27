import React, { useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import { fontFamily, useColors } from '@/theme';
import { Text } from '@/components/common';
import type { QuestionHint } from '@/types/handsfree';
import { nativeDriver, useAnimatedColor, useOnChange } from './anim';
import { CheckIcon } from './icons';

export interface HintChipsProps {
  hints: QuestionHint[];
  covered: string[];
  /** The hint whose nudge is showing: its chip has a violet border and pulses once. */
  nudgeHint?: string | null;
  /** Changes on each new nudge, so the chip pulses again. */
  pulseKey?: number;
  reduce?: boolean;
}

/**
 * "Try to cover" chips, the only progress signal on a card. A chip turns sage with a check when
 * DutyGraph has heard it; the missing chip pulses once when its nudge appears.
 */
export function HintChips({ hints, covered, nudgeHint, pulseKey = 0, reduce }: HintChipsProps) {
  if (!hints.length) return null;
  return (
    <View>
      <Text variant="chip" color="faint" style={{ letterSpacing: 0.72, marginBottom: 8 }}>
        Try to cover
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {hints.map((h) => (
          <Chip key={h.id} label={h.label} hit={covered.includes(h.id)} nudged={nudgeHint === h.id} pulseKey={pulseKey} reduce={reduce} />
        ))}
      </View>
    </View>
  );
}

function Chip({ label, hit, nudged, pulseKey, reduce }: { label: string; hit: boolean; nudged: boolean; pulseKey: number; reduce?: boolean }) {
  const c = useColors();
  const pulsing = nudged && !hit;
  const bg = useAnimatedColor(hit ? c.sageBg : 'transparent', 350, reduce);
  const border = useAnimatedColor(hit ? c.sage : pulsing ? c.violet : c.line, 350, reduce);
  const fg = useAnimatedColor(hit ? c.sage : c.muted, 350, reduce);
  const scale = useRef(new Animated.Value(1)).current;
  const ring = useRef(new Animated.Value(0)).current;

  // dgpulse: a violet ring spreads out and the chip grows 7 %, once (1.4 s).
  useOnChange(pulsing ? pulseKey : -1, () => {
    if (!pulsing || reduce) return;
    ring.setValue(0);
    const a = Animated.parallel([
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.07, duration: 560, easing: Easing.ease, useNativeDriver: nativeDriver }),
        Animated.timing(scale, { toValue: 1, duration: 840, easing: Easing.ease, useNativeDriver: nativeDriver }),
      ]),
      Animated.timing(ring, { toValue: 1, duration: 560, easing: Easing.out(Easing.ease), useNativeDriver: nativeDriver }),
    ]);
    a.start();
    return () => a.stop();
  });

  return (
    <Animated.View
      accessible
      accessibilityLabel={hit ? `${label}, covered` : label}
      style={{
        minHeight: 32,
        paddingHorizontal: 12,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: border,
        backgroundColor: bg,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        transform: [{ scale }],
      }}
    >
      {pulsing && !reduce ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: -1,
            left: -1,
            right: -1,
            bottom: -1,
            borderRadius: 17,
            borderWidth: 2,
            borderColor: c.violet,
            opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] }),
            transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] }) }],
          }}
        />
      ) : null}
      {hit ? <CheckIcon size={12} color={c.sage} /> : null}
      <Animated.Text maxFontSizeMultiplier={1.8} style={{ fontFamily: fontFamily.medium, fontSize: 13, lineHeight: 16, color: fg }}>
        {label}
      </Animated.Text>
    </Animated.View>
  );
}
