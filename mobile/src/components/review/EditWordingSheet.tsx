import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fontFamily, radius, useColors } from '@/theme';
import { Button, Text } from '@/components/common';

export interface EditWordingSheetProps {
  visible: boolean;
  initialText: string;
  title?: string;
  subtitle?: string;
  saveLabel?: string;
  onCancel: () => void;
  onSave: (text: string) => void;
}

/** "Say it your way": the participant's wording replaces DutyGraph's (prototype). */
export function EditWordingSheet({
  visible,
  initialText,
  title = 'Say it your way',
  subtitle = 'Your wording replaces ours.',
  saveLabel = 'Save wording',
  onCancel,
  onSave,
}: EditWordingSheetProps) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState(initialText);
  useEffect(() => {
    if (visible) setDraft(initialText);
  }, [visible, initialText]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable accessibilityLabel="Cancel" onPress={onCancel} style={{ flex: 1, backgroundColor: c.scrim, justifyContent: 'flex-end' }}>
          <Pressable
            onPress={() => {}}
            accessibilityViewIsModal
            style={{
              backgroundColor: c.surface,
              borderTopWidth: 1,
              borderColor: c.line,
              borderTopLeftRadius: radius.sheet,
              borderTopRightRadius: radius.sheet,
              paddingTop: 22,
              paddingHorizontal: 20,
              paddingBottom: Math.max(insets.bottom, 18) + 8,
            }}
          >
            <Text variant="cardTitle" accessibilityRole="header" style={{ fontSize: 19, marginBottom: 6 }}>
              {title}
            </Text>
            <Text variant="meta" color="muted" style={{ marginBottom: 14 }}>
              {subtitle}
            </Text>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              multiline
              autoFocus
              accessibilityLabel="Your wording"
              placeholderTextColor={c.faint}
              textAlignVertical="top"
              style={{
                minHeight: 130,
                maxHeight: 220,
                borderRadius: radius.button,
                borderWidth: 1,
                borderColor: c.line,
                backgroundColor: c.raised,
                color: c.ink,
                padding: 14,
                fontFamily: fontFamily.regular,
                fontSize: 16,
                lineHeight: 25,
              }}
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
              <Button label="Cancel" onPress={onCancel} full style={{ flex: 1, minHeight: 48 }} />
              <Button label={saveLabel} kind="primary" onPress={() => onSave(draft)} disabled={!draft.trim()} style={{ flex: 1 }} />
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
