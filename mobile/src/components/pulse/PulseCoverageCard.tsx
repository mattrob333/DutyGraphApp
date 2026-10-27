import React from 'react';
import { View } from 'react-native';
import { Card, Text } from '@/components/common';

/** "Your Pulse will cover · about 4 min" with numbered topics. */
export function PulseCoverageCard({ minutes, numbered, rows }: { minutes: number; numbered: boolean; rows: string[] }) {
  return (
    <Card level="surface" style={{ marginBottom: 0 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, gap: 10 }}>
        <Text variant="bodyStrong" style={{ fontSize: 15 }}>
          Your Pulse will cover
        </Text>
        <Text variant="meta" color="faint">
          about {minutes} min
        </Text>
      </View>
      <View style={{ gap: 8 }}>
        {rows.map((t, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
            {numbered ? (
              <Text variant="body" color="faint" style={{ width: 18, fontSize: 15 }}>
                {i + 1}
              </Text>
            ) : null}
            <Text variant="body" color="muted" style={{ flex: 1, fontSize: 15, lineHeight: 22 }}>
              {t}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}
