import React, { useEffect, useRef } from 'react';
import { Animated, Platform, View } from 'react-native';
import { fontFamily, radius, useColors } from '@/theme';
import { Text } from '@/components/common';
import { useReducedMotion } from './useReducedMotion';

/** DutyGraph's question: violet dot, DUTYGRAPH label, large text (prototype). */
export function AgentPromptBubble({ text, kind, live }: { text: string; kind?: 'QUESTION' | 'FOLLOW_UP' | 'ACKNOWLEDGEMENT'; live?: boolean }) {
  const c = useColors();
  const follow = kind === 'FOLLOW_UP';
  return (
    <View
      style={{ marginTop: 20 }}
      accessible
      accessibilityLabel={`${follow ? 'DutyGraph follow-up' : 'DutyGraph asks'}: ${text}`}
      accessibilityLiveRegion={live ? 'polite' : 'none'}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 7 }}>
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.violet }} />
        <Text variant="label" color="faint" style={{ letterSpacing: 1.3 }}>
          DutyGraph
        </Text>
        {follow ? (
          <View style={{ borderRadius: radius.chip, backgroundColor: c.violetBg, paddingHorizontal: 8, paddingVertical: 4 }}>
            <Text variant="chip" color="violet">
              Follow-up
            </Text>
          </View>
        ) : null}
      </View>
      <Text variant="question" style={{ fontFamily: fontFamily.medium, letterSpacing: -0.2 }}>
        {text}
      </Text>
    </View>
  );
}

/** The participant's own answer: bordered, offset to the right. `pending` marks one not yet acknowledged. */
export function ParticipantBubble({ text, pending }: { text: string; pending?: boolean }) {
  const c = useColors();
  return (
    <View
      accessible
      accessibilityLabel={`You said${pending ? " (sending)" : ""}: ${text}`}
      style={{ marginTop: 14, marginLeft: 28, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, borderRadius: radius.card, paddingVertical: 12, paddingHorizontal: 14, opacity: pending ? 0.85 : 1 }}
    >
      <Text variant="body" color="muted" style={{ fontSize: 15, lineHeight: 23 }}>
        {text}
      </Text>
    </View>
  );
}

/** Muted one-liner after an answer ("Got it. I'll mark that commitment complete."). */
export function AcknowledgementLine({ text }: { text: string }) {
  return (
    <Text variant="meta" color="muted" style={{ marginTop: 14, fontSize: 15, lineHeight: 22 }}>
      {text}
    </Text>
  );
}

/** Three pulsing violet dots (prototype `isThinking`); static under reduced motion. */
export function ThinkingIndicator({ label = 'Understanding your answer…' }: { label?: string }) {
  const c = useColors();
  const reduce = useReducedMotion();
  return (
    <View accessibilityLiveRegion="polite" accessible accessibilityLabel={label} style={{ marginTop: 20, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {[0, 1, 2].map((i) => (
          <Dot key={i} delay={i * 200} reduce={reduce} color={c.violet} />
        ))}
      </View>
      <Text variant="meta" color="muted" style={{ fontSize: 15 }}>
        {label}
      </Text>
    </View>
  );
}

function Dot({ delay, reduce, color }: { delay: number; reduce: boolean; color: string }) {
  const v = useRef(new Animated.Value(reduce ? 1 : 0.35)).current;
  useEffect(() => {
    if (reduce) {
      v.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 500, delay, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(v, { toValue: 0.35, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduce, delay, v]);
  return <Animated.View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color, opacity: v }} />;
}
