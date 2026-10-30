import React, { useEffect, useRef } from "react";
import { TextInput, View } from "react-native";
import { Button, Text } from "@/components/common";
import { radius, spacing, useColors } from "@/theme";
import type { LiveSpeech } from "@/features/voice/live/types";
import { MAX_EARN_WORDS_LENGTH } from "./voice-logic";
import { useEarnDictation } from "./useEarnDictation";

export function VoiceField({
  value,
  onChange,
  label = "Task words",
  disabled = false,
  createSpeech,
  stopHandle,
}: {
  value: string;
  onChange: (text: string) => void;
  label?: string;
  disabled?: boolean;
  createSpeech?: () => LiveSpeech;
  stopHandle?: React.MutableRefObject<(() => Promise<boolean>) | null>;
}) {
  const c = useColors(),
    input = useRef<TextInput>(null);
  const voice = useEarnDictation({ value, onChange, disabled, createSpeech });
  useEffect(() => {
    if (stopHandle) stopHandle.current = voice.stop;
    return () => {
      if (stopHandle) stopHandle.current = null;
    };
  }, [stopHandle, voice.stop]);
  return (
    <View style={{ gap: spacing.sm }}>
      <Text variant="metaStrong">{label}</Text>
      <TextInput
        ref={input}
        accessibilityLabel={label}
        multiline
        value={value}
        onChangeText={onChange}
        editable={!disabled && !voice.active}
        maxLength={MAX_EARN_WORDS_LENGTH}
        placeholder="Type your words here."
        placeholderTextColor={c.faint}
        textAlignVertical="top"
        style={{
          minHeight: 140,
          color: c.ink,
          backgroundColor: c.surface,
          borderColor: c.line,
          borderWidth: 1,
          borderRadius: radius.card,
          padding: spacing.md,
          fontSize: 16,
        }}
      />
      <Text variant="small" color="muted">
        Your phone’s speech service may process your voice. Review the words
        before saving.
      </Text>
      <Text
        accessibilityLiveRegion="polite"
        color={
          voice.active ? "red" : voice.phase === "error" ? "amber" : "muted"
        }
        variant="meta"
      >
        {voice.phase === "stopping"
          ? "Stopping microphone…"
          : voice.phase === "starting"
            ? "Opening microphone…"
            : voice.phase === "listening"
              ? "Listening. The microphone is on."
              : voice.message || "Microphone off."}
      </Text>
      {voice.active ? (
        <Button
          label="Stop listening"
          disabled={voice.phase === "stopping"}
          onPress={() => void voice.stop()}
        />
      ) : (
        <Button
          label="Start listening"
          disabled={disabled || voice.phase === "unavailable"}
          onPress={voice.start}
        />
      )}
      <Button
        label="Type instead"
        kind="link"
        onPress={() => {
          void voice.stop().then((closed) => {
            if (closed) input.current?.focus();
          });
        }}
      />
    </View>
  );
}
