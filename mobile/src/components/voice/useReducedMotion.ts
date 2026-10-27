import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { usePreferencesStore } from '@/state/preferences';

/** True when the OS or the in-app preference asks for less motion. */
export function useReducedMotion(): boolean {
  const pref = usePreferencesStore((s) => s.reduceMotion);
  const [os, setOs] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((v) => alive && setOs(!!v))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v: boolean) => setOs(!!v));
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);
  return pref || os;
}
