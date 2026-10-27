import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, View } from 'react-native';
import { useColors } from '@/theme';
import { useReducedMotion } from './useReducedMotion';

const BARS = [
  { d: 1100, delay: 0, rest: 1 },
  { d: 900, delay: 100, rest: 0.55 },
  { d: 1300, delay: 200, rest: 0.3 },
  { d: 1000, delay: 50, rest: 0.85 },
  { d: 1200, delay: 300, rest: 0.4 },
  { d: 950, delay: 150, rest: 1 },
  { d: 1150, delay: 250, rest: 0.6 },
  { d: 1050, delay: 350, rest: 0.75 },
];

/**
 * Level bars for an open microphone. Motion is decorative: recording state is
 * always stated in words next to it ("Listening…" / "Paused"), and the
 * waveform stops moving under reduced motion or when paused.
 */
export function Waveform({ active, height = 30 }: { active: boolean; height?: number }) {
  const c = useColors();
  const reduce = useReducedMotion();
  const animate = active && !reduce;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={active ? 'Microphone is listening' : 'Microphone is paused'}
      style={{ flex: 1, height, flexDirection: 'row', alignItems: 'center', gap: 4 }}
    >
      {BARS.map((b, i) => (
        <Bar key={i} spec={b} animate={animate} active={active} height={height} color={c.accentBg} />
      ))}
    </View>
  );
}

function Bar({ spec, animate, active, height, color }: { spec: (typeof BARS)[number]; animate: boolean; active: boolean; height: number; color: string }) {
  const v = useRef(new Animated.Value(spec.rest)).current;
  useEffect(() => {
    if (!animate) {
      v.setValue(active ? spec.rest : 0.14);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: spec.d / 2, delay: spec.delay, easing: Easing.inOut(Easing.ease), useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(v, { toValue: 0.25, duration: spec.d / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: Platform.OS !== 'web' }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [animate, active, spec, v]);
  return <Animated.View style={{ flex: 1, height, borderRadius: 3, backgroundColor: color, transform: [{ scaleY: v }] }} />;
}
