import React from 'react';
import { View } from 'react-native';
import { Text } from '@/components/common';
import { participantStatusLabel } from '@/features/pulse/format';
import { radius, useColors } from '@/theme';
import type { TeamStatusRow } from '@/types/domain';

/** Team completion list. Rows keep the order the server provided; no ranking, times or answers. */
export function TeamStatusList({ rows, dueAt }: { rows: TeamStatusRow[]; dueAt?: string }) {
  const c = useColors();
  return (
    <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, borderRadius: radius.card, paddingHorizontal: 16 }}>
      {rows.map((r, i) => {
        const s = participantStatusLabel(r.status, dueAt);
        const name = r.isYou ? `${r.displayName} (you)` : r.displayName;
        return (
          <View
            key={r.participantId}
            accessible
            accessibilityLabel={`${name}, ${s.label}`}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 50, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.line }}
          >
            <Text variant="body" style={{ flex: 1, fontSize: 15 }}>
              {r.displayName}
              {r.isYou ? <Text variant="body" color="faint" style={{ fontSize: 15 }}>{' (you)'}</Text> : null}
            </Text>
            <Text variant="metaStrong" color={s.color} style={{ fontSize: 13 }}>
              {s.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
