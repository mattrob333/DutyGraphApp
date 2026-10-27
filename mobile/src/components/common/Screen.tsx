import React from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, View, type ScrollViewProps } from 'react-native';
import { spacing, useColors } from '@/theme';

export interface ScreenProps extends ScrollViewProps {
  children: React.ReactNode;
  /** Sticky footer (BottomActionBar) rendered below the scroll area. */
  footer?: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Disable the scroll view (conversation screen manages its own). */
  scroll?: boolean;
  scrollRef?: React.Ref<ScrollView>;
}

/** ScreenShell: page background, gutter, optional pull-to-refresh and footer. */
export function Screen({ children, footer, refreshing, onRefresh, scroll = true, scrollRef, contentContainerStyle, ...rest }: ScreenProps) {
  const c = useColors();
  const body = scroll ? (
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1 }}
      contentContainerStyle={[{ paddingHorizontal: spacing.gutter, paddingTop: 22, paddingBottom: 32 }, contentContainerStyle]}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={c.muted} /> : undefined}
      {...rest}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={{ flex: 1 }}>{children}</View>
  );
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {body}
      {footer}
    </KeyboardAvoidingView>
  );
}
