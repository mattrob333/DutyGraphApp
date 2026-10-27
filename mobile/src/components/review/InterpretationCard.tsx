import React from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { radius, spacing, useColors } from '@/theme';
import { Button, Text } from '@/components/common';
import type { InterpretationItem } from '@/types/domain';
import { effectiveText } from '@/features/conversation/reviewLogic';

export interface InterpretationCardProps {
  item: InterpretationItem;
  onConfirm: () => void;
  onChange: () => void;
}

/**
 * One thing DutyGraph understood, for the participant to check. Proposed until
 * they act: "Looks right" confirms it, "Change wording" replaces our words
 * with theirs. Which buttons show is decided by the server (`allowedActions`).
 */
export function InterpretationCard({ item, onConfirm, onChange }: InterpretationCardProps) {
  const c = useColors();
  const confirmed = item.status === 'CONFIRMED';
  const edited = item.status === 'CHANGED';
  const canConfirm = item.allowedActions.includes('CONFIRM');
  const canChange = item.allowedActions.includes('CHANGE') || (!!item.addedByParticipant && edited);
  const confirmLabel = item.confirmLabel ?? 'Looks right';
  const changeLabel = item.confirmLabel ? 'Change' : 'Change wording';
  const doneLabel = item.confirmedLabel ?? 'Looks right';
  const text = effectiveText(item);

  return (
    <View
      style={{
        backgroundColor: c.raised,
        borderWidth: 1,
        borderColor: c.line,
        borderRadius: radius.card,
        paddingVertical: spacing.cardV,
        paddingHorizontal: spacing.cardH,
        marginBottom: spacing.md,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 8, minHeight: 22 }}>
        <Text variant="label" color="faint" style={{ flexShrink: 1 }}>
          {item.label}
        </Text>
        {confirmed ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: c.sageBg, borderRadius: radius.chip, paddingHorizontal: 9, paddingVertical: 5 }}>
            <Svg width={11} height={11} viewBox="0 0 12 12" fill="none" stroke={c.sage} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M2 6.3 4.8 9 10 3.2" />
            </Svg>
            <Text variant="chip" color="sage">
              {doneLabel}
            </Text>
          </View>
        ) : null}
        {edited ? (
          <View style={{ backgroundColor: c.accentBg, borderRadius: radius.chip, paddingHorizontal: 9, paddingVertical: 5 }}>
            <Text variant="chip">Your wording</Text>
          </View>
        ) : null}
      </View>
      <Text variant="body" style={{ marginBottom: 14 }}>
        {text}
      </Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {canConfirm && !confirmed && !edited ? <Button label={confirmLabel} full onPress={onConfirm} style={{ flex: 1 }} /> : null}
        {canChange ? <Button label={changeLabel} full onPress={onChange} style={{ flex: 1 }} /> : null}
      </View>
    </View>
  );
}
