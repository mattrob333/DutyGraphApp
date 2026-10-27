import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import { radius, useColors } from '@/theme';
import { Text } from '@/components/common';
import { captionTail } from '@/features/handsfree/format';
import { nativeDriver } from './anim';

export type CaptionState = 'listening' | 'checking' | 'paused' | 'speaking';

const LABEL: Record<CaptionState, string> = { speaking: 'Speaking…', listening: 'Listening…', checking: 'Checking', paused: 'Paused · mic off' };

/** The prototype's seven bars (dgwave): duration and delay in ms. */
const BARS = [
  [1100, 0],
  [900, 100],
  [1300, 200],
  [1000, 50],
  [1200, 300],
  [950, 150],
  [1150, 250],
] as const;

export interface CaptionBoxProps {
  state: CaptionState;
  /** The microphone is on: the waveform moves. */
  live: boolean;
  text: string;
  /** Shown while nothing has been said yet. */
  prompt: string;
  reduce?: boolean;
}

/**
 * Live captions under the card (hf-05 … hf-12): a dashed box with the microphone state in words,
 * a small waveform while the microphone is on, and the last words heard.
 */
export function CaptionBox({ state, live, text, prompt, reduce }: CaptionBoxProps) {
  const c = useColors();
  const words = captionTail(text);
  return (
    <View
      accessible
      accessibilityLabel={`${LABEL[state]}. ${words || prompt}`}
      style={{ marginTop: 2, marginHorizontal: 20, borderWidth: 1, borderStyle: 'dashed', borderColor: c.line, borderRadius: radius.card, paddingVertical: 12, paddingHorizontal: 14, minHeight: 106 }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <Text variant="label" style={{ color: state === 'paused' ? c.ink : c.violet, lineHeight: 16 }}>
          {LABEL[state]}
        </Text>
        <View style={{ width: 72, height: 20, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
          {live ? BARS.map(([d, delay], i) => <WaveBar key={i} duration={d} delay={delay} still={!!reduce} />) : <View style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: c.line }} />}
        </View>
      </View>
      {words ? (
        <Text variant="body" style={{ lineHeight: 24 }}>
          {words}
        </Text>
      ) : (
        <Text variant="body" color="faint" style={{ fontSize: 15, lineHeight: 22.5 }}>
          {prompt}
        </Text>
      )}
    </View>
  );
}

function WaveBar({ duration, delay, still }: { duration: number; delay: number; still: boolean }) {
  const c = useColors();
  const v = useRef(new Animated.Value(still ? 0.6 : 0.25)).current;
  useEffect(() => {
    if (still) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: duration / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: nativeDriver }),
        Animated.timing(v, { toValue: 0.25, duration: duration / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: nativeDriver }),
      ]),
    );
    const t = setTimeout(() => loop.start(), delay);
    return () => {
      clearTimeout(t);
      loop.stop();
    };
  }, [duration, delay, still, v]);
  return <Animated.View style={{ flex: 1, height: '100%', borderRadius: 2, backgroundColor: c.violet, transform: [{ scaleY: v }] }} />;
}
