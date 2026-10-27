import React from 'react';
import { View } from 'react-native';
import { Button, Card, StatusChip, Text } from '@/components/common';
import { REQUEST_TYPE_LABEL, dueChipFor } from '@/features/today/requests';
import type { ParticipationRequest } from '@/types/domain';

export interface RequestCardProps {
  request: ParticipationRequest;
  /** Server clock (feed.asOf) used for the due chip. */
  now: Date;
  /** dueNow = raised card with a due chip; later = surface card. */
  variant: 'dueNow' | 'later';
  /** Full-width primary button (first due-now Pulse). */
  primary?: boolean;
  onOpen: (r: ParticipationRequest) => void;
}

/** One participation request on Today. Factual states only: no streaks or scores. */
export function RequestCard({ request, now, variant, primary, onOpen }: RequestCardProps) {
  const dueNow = variant === 'dueNow';
  const chip = dueNow ? dueChipFor(request, now) : undefined;
  const typeLabel = REQUEST_TYPE_LABEL[request.type];
  return (
    <Card level={dueNow ? 'raised' : 'surface'}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, minHeight: dueNow ? 22 : undefined, marginBottom: 8 }}>
        <Text variant="label" color="faint">
          {typeLabel}
        </Text>
        {chip ? <StatusChip label={chip.label} tone={chip.tone} /> : null}
      </View>
      <Text variant={dueNow ? 'cardTitle' : 'bodyStrong'} accessibilityRole="header">
        {request.title}
      </Text>
      <Text variant="meta" color="muted" style={{ marginTop: 3 }}>
        {request.summary}
      </Text>
      <Button
        label={request.cta}
        kind={primary ? 'primary' : 'secondary'}
        onPress={() => onOpen(request)}
        accessibilityHint={`${typeLabel}: ${request.title}`}
        style={{ marginTop: dueNow ? 14 : 12 }}
      />
    </Card>
  );
}
