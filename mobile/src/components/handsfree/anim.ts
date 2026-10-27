/**
 * Small Animated helpers for the hands-free cards. Colors animate on the JS driver (the native
 * driver does not animate colors); transforms and opacity use the native driver off the web.
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform } from 'react-native';

export const nativeDriver = Platform.OS !== 'web';

/** The prototype's card slide: cubic-bezier(.3, 1.22, .4, 1), a small overshoot. */
export const slideEasing = Easing.bezier(0.3, 1.22, 0.4, 1);
/** The check mark's pop: cubic-bezier(.3, 1.6, .5, 1). */
export const popEasing = Easing.bezier(0.3, 1.6, 0.5, 1);

/**
 * A color that eases to each new value (`transition: background-color .45s ease` in the
 * prototype). With `instant` it jumps.
 */
export function useAnimatedColor(target: string, duration = 450, instant = false) {
  const v = useRef(new Animated.Value(1)).current;
  const [range, setRange] = useState<[string, string]>([target, target]);
  const last = useRef(target);
  useEffect(() => {
    if (last.current === target) return;
    const from = last.current;
    last.current = target;
    if (instant) {
      setRange([target, target]);
      v.setValue(1);
      return;
    }
    setRange([from, target]);
    v.setValue(0);
    const a = Animated.timing(v, { toValue: 1, duration, easing: Easing.ease, useNativeDriver: false });
    a.start();
    return () => a.stop();
  }, [target, duration, instant, v]);
  return v.interpolate({ inputRange: [0, 1], outputRange: range });
}

/** Runs `run()` each time `key` changes (not on mount), e.g. the chip pulse on a new nudge. */
export function useOnChange(key: unknown, run: () => void | (() => void)) {
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    return run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
