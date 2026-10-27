import React from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { radius, spacing, useColors } from '@/theme';
import { Text } from '@/components/common';
import type { Commitment } from '@/types/domain';

export type CommitmentCardVariant = 'today' | 'week' | 'waiting';

/** Work list card. Text is factual: title, due line, where it came from. */
export function CommitmentCard({ commitment, variant, onPress }: { commitment: Commitment; variant: CommitmentCardVariant; onPress: () => void }) {
  const c = useColors();
  const from = variant === 'waiting' ? "You're waiting on this" : `From ${commitment.sourceLabel}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${commitment.title}. ${commitment.dueLabel}. ${from}`}
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: variant === 'today' ? c.raised : variant === 'week' ? c.surface : 'transparent',
        borderWidth: 1,
        borderStyle: variant === 'waiting' ? 'dashed' : 'solid',
        borderColor: c.line,
        borderRadius: radius.card,
        paddingVertical: 15,
        paddingHorizontal: spacing.cardH,
        marginBottom: 10,
        minHeight: 44,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Text variant="bodyStrong">{commitment.title}</Text>
      <Text variant="meta" color={variant === 'today' ? 'amber' : 'muted'} style={{ marginTop: 4, fontWeight: variant === 'today' ? '500' : '400' }}>
        {commitment.dueLabel}
      </Text>
      <Text variant="small" color="faint" style={{ marginTop: 2 }}>
        {from}
      </Text>
    </Pressable>
  );
}

/** Completed row: sage check + title, still opens the detail. */
export function CompletedRow({ commitment, onPress }: { commitment: Commitment; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${commitment.title}, completed`}
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingVertical: 6, opacity: pressed ? 0.8 : 1 })}
    >
      <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: c.sageBg, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={11} height={11} viewBox="0 0 12 12" fill="none" stroke={c.sage} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M2.5 6.3l2.4 2.4 4.6-5" />
        </Svg>
      </View>
      <Text variant="body" color="muted" style={{ flex: 1 }}>
        {commitment.title}
      </Text>
    </Pressable>
  );
}
