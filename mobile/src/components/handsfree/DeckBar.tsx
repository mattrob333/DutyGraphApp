import React from 'react';
import { Pressable, View } from 'react-native';
import { fontFamily, radius, useColors } from '@/theme';
import { BottomActionBar, Text } from '@/components/common';

export interface DeckBarProps {
  mode: 'voice' | 'text';
  /** Looking at a past card: only "Back to question N". */
  returnLabel?: string | null;
  paused: boolean;
  /** The "Anything else?" card: "No, that's all" instead of Skip. */
  isElse: boolean;
  /** Every chip heard (or something said on "Anything else?"): Next lights up. */
  ready?: boolean;
  /** Got it, Saved or Skipped is showing: no Next (the card is already moving on). */
  held?: boolean;
  onReturn: () => void;
  onPause: () => void;
  onResume: () => void;
  onSkip: () => void;
  onFinish: () => void;
  onToText: () => void;
  onToVoice: () => void;
  onNext: () => void;
}

/**
 * The deck's bottom bar: Next above Pause, Skip and Type instead while talking (a spoken card never
 * moves on by itself, October 18: Next is quiet until every chip is heard, then lit); Use voice, Skip
 * and Next while typing; Resume when paused; "Back to question N" on a past card.
 */
export function DeckBar(p: DeckBarProps) {
  if (p.returnLabel) {
    return (
      <BottomActionBar>
        <BarButton label={p.returnLabel} primary onPress={p.onReturn} tall />
      </BottomActionBar>
    );
  }
  if (p.mode === 'text') {
    return (
      <BottomActionBar>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <BarButton label="Use voice" flex={1} tall onPress={p.onToVoice} />
          {p.isElse ? <BarButton label="No, that's all" flex={1.4} tall onPress={p.onFinish} /> : <BarButton label="Skip" flex={1} tall onPress={p.onSkip} />}
          <BarButton label="Next" flex={1.4} tall primary large onPress={p.onNext} />
        </View>
      </BottomActionBar>
    );
  }
  return (
    <BottomActionBar>
      {!p.held ? (
        <View style={{ marginBottom: 8 }}>
          <BarButton
            label="Next"
            accessibilityLabel={p.ready ? 'Next. That covers it' : 'Next'}
            ready={!!p.ready}
            quiet={!p.ready}
            tall
            large
            onPress={p.onNext}
          />
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {p.paused ? <BarButton label="Resume" flex={1.4} primary onPress={p.onResume} /> : <BarButton label="Pause" flex={1} onPress={p.onPause} />}
        {p.isElse ? <BarButton label="No, that's all" flex={1.5} onPress={p.onFinish} /> : <BarButton label="Skip" flex={1} onPress={p.onSkip} />}
        <BarButton label="Type instead" flex={1.2} onPress={p.onToText} />
      </View>
    </BottomActionBar>
  );
}

function BarButton({
  label,
  onPress,
  primary,
  flex,
  tall,
  large,
  quiet,
  ready,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  flex?: number;
  tall?: boolean;
  large?: boolean;
  /** Shown but not yet the thing to tap: muted text. */
  quiet?: boolean;
  /** Lit in the "ready" green (a covered card's Next). */
  ready?: boolean;
  accessibilityLabel?: string;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      style={({ pressed }) => ({
        flex,
        minHeight: tall || large ? 48 : 44,
        borderRadius: radius.button,
        paddingHorizontal: 6,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: ready ? c.ready : primary ? c.primary : 'transparent',
        borderWidth: primary || ready ? 0 : 1,
        borderColor: c.line,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Text
        numberOfLines={1}
        // The three buttons share one row: larger text sizes stop at 1.3x so the labels fit.
        maxFontSizeMultiplier={1.3}
        style={{
          fontFamily: primary || ready ? fontFamily.semibold : fontFamily.medium,
          fontSize: large || (primary && !flex) ? 16 : primary ? 15 : 14,
          lineHeight: 19,
          color: ready ? c.readyInk : primary ? c.primaryInk : quiet ? c.muted : c.ink,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
