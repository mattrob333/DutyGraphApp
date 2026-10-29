import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { CompanionApiError } from '@/types/domain';
import { spacing, useColors } from '@/theme';
import { Text } from './Text';
import { Button } from './Button';
import { Card } from './Card';

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  const c = useColors();
  return (
    <View accessibilityLiveRegion="polite" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: 12, backgroundColor: c.bg, minHeight: 200 }}>
      <ActivityIndicator color={c.muted} />
      <Text variant="meta" color="muted">
        {label}
      </Text>
    </View>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <Card level="surface">
      <Text variant="body" color="muted">
        {children}
      </Text>
    </Card>
  );
}

/** Plain-language error text for a repository error. */
export function errorMessage(error: unknown): string {
  if (error instanceof CompanionApiError) {
    if (error.code === 'NOT_AVAILABLE') return "This part of DutyGraph isn't available on your account yet.";
    if (error.code === 'REQUEST_TIMEOUT') return 'That took too long. It may still have been received. Try the same action again to check.';
    if (error.code === 'SESSION_ENDED') return error.message;
    if (error.status === 0) return "Couldn't connect. Check your connection and try again.";
    return error.message;
  }
  return 'Something went wrong. Please try again.';
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const retryable = !(error instanceof CompanionApiError) || error.retryable || error.status === 0;
  return (
    <View style={{ padding: spacing.gutter, paddingTop: 28 }}>
      <Card level="surface">
        <Text variant="bodyStrong" style={{ marginBottom: 6 }}>
          {error instanceof CompanionApiError && error.code === 'NOT_AVAILABLE' ? 'Not available yet' : "Couldn't load this"}
        </Text>
        <Text variant="meta" color="muted">
          {errorMessage(error)}
        </Text>
        {onRetry && retryable ? <Button label="Try again" onPress={onRetry} style={{ marginTop: 14 }} /> : null}
      </Card>
    </View>
  );
}
