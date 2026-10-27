import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, useColors } from '@/theme';
import { Text } from '@/components/common';
import type { SkipReason } from '@/types/handsfree';

const OPTIONS: { reason: SkipReason; label: string }[] = [
  { reason: 'skip', label: 'Skip' },
  { reason: 'dontknow', label: "I don't know yet" },
  { reason: 'someone', label: 'Someone else should answer this' },
];

/**
 * "Skip this one?" (prototype): three equal choices, no judgment, and Keep answering. The scrim is
 * a sibling behind the sheet and hidden from screen readers, so each choice stays its own element.
 */
export function SkipSheet({ visible, onSkip, onClose, reduce }: { visible: boolean; onSkip: (r: SkipReason) => void; onClose: () => void; reduce?: boolean }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType={reduce ? 'fade' : 'slide'} onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          accessible={false}
          importantForAccessibility="no"
          accessibilityElementsHidden
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }]}
        />
        <View
          accessibilityViewIsModal
          onAccessibilityEscape={onClose}
          style={{ backgroundColor: c.surface, borderTopWidth: 1, borderColor: c.line, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingTop: 22, paddingHorizontal: 20, paddingBottom: Math.max(insets.bottom, 18) + 8 }}
        >
          <Text accessibilityRole="header" variant="cardTitle" style={{ fontSize: 19, lineHeight: 25, marginBottom: 6 }}>
            Skip this one?
          </Text>
          <Text variant="body" color="muted" style={{ fontSize: 15, lineHeight: 22.5, marginBottom: 14 }}>
            Pick whichever fits. Any of these is fine.
          </Text>
          <View style={{ gap: 8 }}>
            {OPTIONS.map((o) => (
              <Pressable
                key={o.reason}
                accessibilityRole="button"
                accessibilityLabel={o.label}
                onPress={() => onSkip(o.reason)}
                style={({ pressed }) => ({ minHeight: 52, paddingHorizontal: 16, justifyContent: 'center', borderRadius: radius.button, borderWidth: 1, borderColor: c.line, backgroundColor: c.raised, opacity: pressed ? 0.8 : 1 })}
              >
                <Text variant="buttonSecondary" style={{ fontSize: 16 }}>
                  {o.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Keep answering"
            onPress={onClose}
            style={({ pressed }) => ({ marginTop: 12, minHeight: 48, borderRadius: radius.button, borderWidth: 1, borderColor: c.line, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}
          >
            <Text variant="buttonSecondary" style={{ fontSize: 16 }}>
              Keep answering
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
