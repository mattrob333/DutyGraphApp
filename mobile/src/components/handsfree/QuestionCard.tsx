import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';
import { fontFamily, radius, useColors } from '@/theme';
import { Text } from '@/components/common';
import type { CardAnswer, HandsFreeQuestion } from '@/types/handsfree';
import { SKIP_LABELS, type DeckPhase } from '@shared/hands-free/deck';
import { youSaid } from '@/features/handsfree/format';
import { nativeDriver, popEasing, useAnimatedColor } from './anim';
import { HintChips } from './HintChips';
import { CheckIcon, PauseIcon, SkipArrowIcon } from './icons';

export interface QuestionCardProps {
  question: HandsFreeQuestion;
  /** The card's live phase when current, else how it ended ("idle" when not answered). */
  status: DeckPhase | 'idle';
  /** The card being answered (not a past card being looked at). */
  current: boolean;
  /** A past card being looked at: "You said:" and Add more instead of the chips. */
  viewing: boolean;
  paused?: boolean;
  answer?: CardAnswer | null;
  covered: string[];
  nudgeHint?: string | null;
  pulseKey?: number;
  reduce?: boolean;
  /** Typing mode: the undo reads "Keep typing". */
  typing?: boolean;
  onKeepTalking?: () => void;
  onAddMore?: () => void;
}

/**
 * One question card (hf-05 … hf-18). Its border and background ease from the card color to sage
 * when DutyGraph has what it needs; the check scales in. Skipped cards go grey, "Anything else?"
 * is violet. While Checking the edge glows violet (a steady violet border with reduced motion).
 */
export function QuestionCard({ question: q, status, current, viewing, paused, answer, covered, nudgeHint, pulseKey, reduce, typing, onKeepTalking, onAddMore }: QuestionCardProps) {
  const c = useColors();
  const sage = status === 'got' || status === 'saved';
  const skipped = status === 'skipped';
  const showPaused = current && !!paused && !sage && !skipped;
  const checking = current && status === 'checking' && !paused;
  const baseBg = q.isElse ? c.violetBg : c.raised;
  const bg = useAnimatedColor(sage ? c.sageBg : skipped ? c.soft : baseBg, 450, reduce);
  const border = useAnimatedColor(sage ? c.sage : checking && reduce ? c.violet : c.line, 450, reduce);
  const hint = current && nudgeHint && !sage && !skipped ? q.hints.find((h) => h.id === nudgeHint) : undefined;
  const statusLabel = sage ? (status === 'saved' ? 'Saved' : 'Got it') : skipped ? SKIP_LABELS[answer?.reason ?? 'skip'] : showPaused ? 'Paused' : '';
  const eyebrow = q.isElse ? 'One last thing' : `Question ${q.index + 1}`;

  return (
    <Animated.View
      testID={`card-${q.index}`}
      style={{
        flex: 1,
        borderRadius: 18,
        borderWidth: 1.5,
        borderColor: border,
        backgroundColor: bg,
        paddingTop: 16,
        paddingHorizontal: 20,
        paddingBottom: 20,
        shadowColor: '#000',
        shadowOpacity: 0.18,
        shadowRadius: 15,
        shadowOffset: { width: 0, height: 10 },
      }}
    >
      {checking && !reduce ? <CheckingGlow /> : null}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, minHeight: 34 }}>
        {sage ? (
          <View accessible accessibilityLabel={statusLabel} style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
            <PopCheck reduce={reduce} />
            <Text variant="bodyStrong" color="sage" style={{ fontSize: 15, lineHeight: 18 }}>
              {statusLabel}
            </Text>
          </View>
        ) : skipped ? (
          <View accessible accessibilityLabel={statusLabel} style={{ flexDirection: 'row', alignItems: 'center', gap: 9, flexShrink: 1 }}>
            <View style={{ width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: c.faint, alignItems: 'center', justifyContent: 'center' }}>
              <SkipArrowIcon size={15} color={c.muted} />
            </View>
            <Text variant="bodyStrong" color="muted" style={{ fontSize: 15, lineHeight: 18, flexShrink: 1 }}>
              {statusLabel}
            </Text>
          </View>
        ) : showPaused ? (
          <View accessible accessibilityLabel="Paused" style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
            <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c.accentBg, alignItems: 'center', justifyContent: 'center' }}>
              <PauseIcon size={12} color={c.ink} />
            </View>
            <Text variant="bodyStrong" style={{ fontSize: 15, lineHeight: 18 }}>
              Paused
            </Text>
          </View>
        ) : (
          <Text variant="label" color={q.isElse ? 'violet' : 'faint'}>
            {eyebrow}
          </Text>
        )}
        {current && sage && onKeepTalking ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={typing ? 'Keep typing' : 'Keep talking'}
            onPress={onKeepTalking}
            style={{ minHeight: 44, marginVertical: -6, marginRight: -8, paddingHorizontal: 8, justifyContent: 'center' }}
          >
            <Text variant="metaStrong" style={{ textDecorationLine: 'underline', lineHeight: 16 }}>
              {typing ? 'Keep typing' : 'Keep talking'}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <Text accessibilityRole="header" style={{ fontFamily: fontFamily.semibold, fontSize: 26, lineHeight: 32.5, letterSpacing: -0.6, marginTop: 10, color: c.ink }}>
        {q.text}
      </Text>

      {hint ? <Nudge key={`${hint.id}-${pulseKey}`} text={hint.nudge} reduce={reduce} /> : null}

      {viewing ? (
        <Text numberOfLines={5} style={{ marginTop: 14, fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 22.5, color: c.muted }}>
          <Text style={{ fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 22.5, color: c.faint }}>You said: </Text>
          {youSaid(answer?.raw ?? '')}
        </Text>
      ) : null}

      <View style={{ flex: 1 }} />

      {viewing && onAddMore ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Add more to question ${q.index + 1}`}
          onPress={onAddMore}
          style={({ pressed }) => ({ alignSelf: 'flex-start', minHeight: 44, paddingHorizontal: 16, borderRadius: radius.button, borderWidth: 1, borderColor: c.line, justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}
        >
          <Text variant="buttonSecondary">Add more</Text>
        </Pressable>
      ) : null}

      {/* A skipped card clears its chips, as the prototype does: no ticks next to "You don't know yet". */}
      {!viewing ? <HintChips hints={q.hints} covered={skipped ? [] : covered} nudgeHint={current && !sage && !skipped ? nudgeHint : null} pulseKey={pulseKey} reduce={reduce} /> : null}
    </Animated.View>
  );
}

/** The check in a sage circle, scaling in (dgpop) unless motion is reduced. */
function PopCheck({ reduce }: { reduce?: boolean }) {
  const c = useColors();
  const v = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) return;
    const a = Animated.timing(v, { toValue: 1, duration: 420, easing: popEasing, useNativeDriver: nativeDriver });
    a.start();
    return () => a.stop();
  }, [reduce, v]);
  return (
    <Animated.View
      style={{
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: c.sage,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
        transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }],
      }}
    >
      <CheckIcon size={16} color={c.sageBg} />
    </Animated.View>
  );
}

/** The violet nudge line, fading up into place (dgin .35s). */
function Nudge({ text, reduce }: { text: string; reduce?: boolean }) {
  const c = useColors();
  const v = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) return;
    const a = Animated.timing(v, { toValue: 1, duration: 350, easing: Easing.ease, useNativeDriver: nativeDriver });
    a.start();
    return () => a.stop();
  }, [reduce, v]);
  return (
    <Animated.Text
      maxFontSizeMultiplier={1.8}
      style={{
        marginTop: 12,
        fontFamily: fontFamily.medium,
        fontSize: 17,
        lineHeight: 24.5,
        color: c.violet,
        opacity: v,
        transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }],
      }}
    >
      {text}
    </Animated.Text>
  );
}

/** dgedge: a soft violet ring that breathes around the card while it checks (CardDeck leaves room for it). */
function CheckingGlow() {
  const c = useColors();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 550, easing: Easing.inOut(Easing.ease), useNativeDriver: nativeDriver }),
        Animated.timing(v, { toValue: 0, duration: 550, easing: Easing.inOut(Easing.ease), useNativeDriver: nativeDriver }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <Animated.View
      pointerEvents="none"
      style={{ position: 'absolute', top: -5.5, left: -5.5, right: -5.5, bottom: -5.5, borderRadius: 22, borderWidth: 4, borderColor: c.violetBg, opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0, 0.6] }) }}
    />
  );
}
