import React from 'react';
import { View } from 'react-native';
import { Card, Divider, Text } from '@/components/common';
import { formatDuration } from '@/features/profile/format';
import type { TimeReturned } from '@/features/profile/useTimeReturned';

/** Personal time returned this month. Never a company cost figure (PRD 29). */
export function TimeReturnedCard({ data }: { data: TimeReturned }) {
  return (
    <Card level="surface" style={{ marginBottom: 0 }} accessibilityLabel={`This month, ${formatDuration(data.totalMinutes)} returned to you`}>
      <Text variant="display" style={{ fontSize: 34, lineHeight: 38, letterSpacing: -1 }}>
        {formatDuration(data.totalMinutes)}
      </Text>
      <Text color="muted" style={{ marginTop: 4, marginBottom: 6 }}>
        Here's the time we gave back to you.
      </Text>
      <Divider />
      {data.items.map((i) => (
        <View key={i.label} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 6 }}>
          <Text style={{ flex: 1 }}>{i.label}</Text>
          <Text color="muted">{i.count}</Text>
        </View>
      ))}
    </Card>
  );
}
