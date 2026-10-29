import React from "react";
import { Pressable, TextInput, View, type TextInputProps } from "react-native";
import { Button, Card, Text } from "@/components/common";
import { radius, spacing, useColors } from "@/theme";
import { formatCents } from "./logic";
export function PayAmount({ cents, note }: { cents: number; note: string }) {
  return (
    <View style={{ gap: 3 }}>
      <Text variant="bodyStrong">{formatCents(cents)}</Text>
      <Text variant="small" color="muted">
        {note || "Your company's pay rules apply."}
      </Text>
    </View>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const c = useColors();
  return (
    <View style={{ gap: 6, marginVertical: 8 }}>
      <Text variant="metaStrong">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={c.faint}
        {...props}
        style={[
          {
            fontSize: 16,
            color: c.ink,
            borderWidth: 1,
            borderColor: c.line,
            borderRadius: radius.button,
            padding: 12,
            minHeight: 44,
            textAlignVertical: "top",
            backgroundColor: c.surface,
          },
          props.multiline && { minHeight: 94 },
          props.style,
        ]}
      />
    </View>
  );
}
export function Row({
  label,
  detail,
  onPress,
}: {
  label: string;
  detail?: string;
  onPress?: () => void;
}) {
  const c = useColors();
  const Container = onPress ? Pressable : View;
  return (
    <Container
      accessible
      accessibilityRole={onPress ? "button" : "text"}
      accessibilityLabel={detail ? `${label}. ${detail}` : label}
      onPress={onPress}
      style={{
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: c.line,
        minHeight: 44,
      }}
    >
      <Text variant="bodyStrong">{label}</Text>
      {!!detail && (
        <Text variant="meta" color="muted">
          {detail}
        </Text>
      )}
    </Container>
  );
}
export function EarnError({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  return (
    <Card>
      <Text accessibilityRole="alert">
        {(error as Error)?.message || "We could not load this part."}
      </Text>
      {retry && (
        <Button
          label="Try again"
          onPress={retry}
          style={{ marginTop: spacing.md }}
        />
      )}
    </Card>
  );
}
export function EarnOff() {
  return (
    <Card>
      <Text>Earn is not turned on for this company.</Text>
      <Text variant="meta" color="muted">
        You can still answer questions and review your work.
      </Text>
    </Card>
  );
}
