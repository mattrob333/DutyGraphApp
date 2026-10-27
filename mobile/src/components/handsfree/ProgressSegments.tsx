import React from 'react';
import { Animated, View } from 'react-native';
import { useColors, type ColorTokens } from '@/theme';
import { useAnimatedColor } from './anim';

export type Segment = 'got' | 'saved' | 'skipped' | 'current' | 'todo';

const colorFor = (c: ColorTokens, s: Segment) => (s === 'got' || s === 'saved' ? c.sage : s === 'skipped' ? c.faint : s === 'current' ? c.violet : c.line);

/** One thin bar per advisor question: sage when answered, grey when skipped, violet for the current one. */
export function ProgressSegments({ segments, reduce }: { segments: Segment[]; reduce?: boolean }) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flexDirection: 'row', gap: 4 }}>
      {segments.map((s, i) => (
        <Bar key={i} segment={s} reduce={reduce} />
      ))}
    </View>
  );
}

function Bar({ segment, reduce }: { segment: Segment; reduce?: boolean }) {
  const c = useColors();
  const bg = useAnimatedColor(colorFor(c, segment), 400, reduce);
  return <Animated.View testID={`segment-${segment}`} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: bg }} />;
}
