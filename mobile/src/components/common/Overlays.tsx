import React, { useEffect } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, type Href } from 'expo-router';
import { radius, spacing, useColors } from '@/theme';
import { useUiStore } from '@/state/ui';
import { Text } from './Text';
import { Button } from './Button';

/** Bottom sheet host for plain-language context ("Why am I being asked this?"). */
export function SheetHost() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const sheet = useUiStore((s) => s.sheet);
  const close = useUiStore((s) => s.closeSheet);
  return (
    <Modal visible={!!sheet} transparent animationType="slide" onRequestClose={close}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        {/* The scrim sits behind the sheet, hidden from screen readers, so the sheet's text and Close stay reachable. */}
        <Pressable
          accessible={false}
          importantForAccessibility="no"
          accessibilityElementsHidden
          onPress={close}
          style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }]}
        />
        <View
          accessibilityViewIsModal
          onAccessibilityEscape={close}
          style={{ backgroundColor: c.surface, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, borderWidth: 1, borderColor: c.line, padding: 22, paddingBottom: Math.max(insets.bottom, 18) + 4, maxHeight: '80%' }}
        >
          <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: c.line, marginBottom: 16 }} />
          <ScrollView>
            <Text variant="cardTitle" accessibilityRole="header" style={{ marginBottom: 10 }}>
              {sheet?.title}
            </Text>
            {sheet?.paragraphs.map((p, i) => (
              <Text key={i} variant="body" color="muted" style={{ marginBottom: 10 }}>
                {p}
              </Text>
            ))}
          </ScrollView>
          <Button label="Close" onPress={close} full style={{ marginTop: 8 }} />
        </View>
      </View>
    </Modal>
  );
}

/** Toast host. Auto-dismisses after 6 seconds; tapping opens the toast's route. */
export function ToastHost({ bottomOffset = 96 }: { bottomOffset?: number }) {
  const c = useColors();
  const toast = useUiStore((s) => s.toast);
  const dismiss = useUiStore((s) => s.dismissToast);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(dismiss, 6000);
    return () => clearTimeout(t);
  }, [toast, dismiss]);
  if (!toast) return null;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 14, right: 14, bottom: bottomOffset }}>
      <Pressable
        accessibilityRole={toast.route ? 'button' : 'alert'}
        accessibilityLiveRegion="assertive"
        onPress={() => {
          dismiss();
          if (toast.route) router.push(toast.route as Href);
        }}
        style={{ backgroundColor: c.raised, borderWidth: 1, borderColor: c.line, borderRadius: radius.card, paddingVertical: 14, paddingHorizontal: 16, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8 }}
      >
        <Text variant="bodyStrong">{toast.title}</Text>
        {toast.body ? (
          <Text variant="meta" color="muted" style={{ marginTop: 2 }}>
            {toast.body}
          </Text>
        ) : null}
      </Pressable>
    </View>
  );
}

/** Amber connectivity banner under the top bar (prototype copy). */
export function OfflineBanner() {
  const c = useColors();
  const offline = useUiStore((s) => s.offline);
  if (!offline) return null;
  return (
    <View accessibilityLiveRegion="polite" style={{ backgroundColor: c.amberBg, paddingVertical: 9, paddingHorizontal: spacing.gutter, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.amber }} />
      <Text variant="small" style={{ color: c.amber, flex: 1 }}>
        No connection. Keep going — sending waits until you're back.
      </Text>
    </View>
  );
}
