import React from 'react';
import { Pressable, View } from 'react-native';
import { radius, useColors } from '@/theme';
import { Text } from '@/components/common';
import type { MeetingSummary } from '@/types/domain';

const STATUS_COLOR = { sage: 'sage', amber: 'amber', violet: 'violet', plain: 'muted' } as const;

/** Meetings tab row: when column on the left, title and toned status on the right. */
export function MeetingStateCard({ meeting, onPress }: { meeting: MeetingSummary; onPress?: () => void }) {
  const c = useColors();
  const tone = STATUS_COLOR[meeting.tone];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${meeting.whenLabel}, ${meeting.title}. ${meeting.statusLine}`}
      accessibilityState={{ disabled: !onPress }}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        gap: 14,
        backgroundColor: c.raised,
        borderWidth: 1,
        borderColor: c.line,
        borderRadius: radius.card,
        paddingVertical: 15,
        paddingHorizontal: 16,
        marginBottom: 10,
        minHeight: 44,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Text variant="metaStrong" color="faint" style={{ width: 62, fontSize: 13, lineHeight: 18 }}>
        {meeting.whenLabel}
      </Text>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="bodyStrong" style={{ lineHeight: 22 }}>
          {meeting.title}
        </Text>
        <Text variant={meeting.tone === 'plain' ? 'meta' : 'metaStrong'} color={tone} style={{ marginTop: 4 }}>
          {meeting.statusLine}
        </Text>
      </View>
    </Pressable>
  );
}
