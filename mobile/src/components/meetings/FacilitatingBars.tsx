import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, View } from 'react-native';
import { useColors } from '@/theme';

const BARS = [
  { ms: 1100, delay: 0 },
  { ms: 900, delay: 150 },
  { ms: 1300, delay: 300 },
  { ms: 1000, delay: 100 },
];

/** Four violet bars that pulse while DutyGraph facilitates. Static when reduce motion is on. */
export function FacilitatingBars() {
  const c = useColors();
  const [reduce, setReduce] = useState(false);
  const vals = useRef(BARS.map(() => new Animated.Value(0.25))).current;

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => alive && setReduce(v)).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (reduce) {
      vals.forEach((v) => v.setValue(0.6));
      return;
    }
    const loops = vals.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(BARS[i].delay),
          Animated.timing(v, { toValue: 1, duration: BARS[i].ms / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: Platform.OS !== 'web' }),
          Animated.timing(v, { toValue: 0.25, duration: BARS[i].ms / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: Platform.OS !== 'web' }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [reduce, vals]);

  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ height: 26, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
      {vals.map((v, i) => (
        <Animated.View key={i} style={{ width: 3, height: 26, borderRadius: 2, backgroundColor: c.violet, transform: [{ scaleY: v }] }} />
      ))}
    </View>
  );
}
