import React, { useCallback, useEffect, useRef, useState } from "react";
import { TextInput, View } from "react-native";
import { router } from "expo-router";
import { useEarnRepository } from "@/api/earn";
import {
  Button,
  ErrorState,
  Heading,
  LoadingState,
  Screen,
  Text,
} from "@/components/common";
import { runPendingEarnCommand } from "./pending-command";
import { radius, spacing, useColors } from "@/theme";
import type { TaskCardDraftInput } from "@/api/earn/types";
import { spokenTaskDraft } from "./voice-logic";
import { VoiceField } from "./VoiceField";

export function VoiceTaskScreen() {
  const repo = useEarnRepository(),
    c = useColors();
  const [capability, setCapability] = useState<boolean | null>(null),
    [capabilityError, setCapabilityError] = useState<unknown>(null);
  const [title, setTitle] = useState(""),
    [duty, setDuty] = useState(""),
    [words, setWords] = useState("");
  const [workType, setWorkType] =
    useState<TaskCardDraftInput["workType"]>("mixed");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  const stopVoice = useRef<(() => Promise<boolean>) | null>(null);
  const alive = useRef(true),
    pending = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const check = useCallback(() => {
    setCapability(null);
    setCapabilityError(null);
    void repo
      .supportsDraftCreation()
      .then((value) => {
        if (alive.current) setCapability(value);
      })
      .catch((e) => {
        if (alive.current) setCapabilityError(e);
      });
  }, [repo]);
  useEffect(check, [check]);
  const save = async () => {
    if (pending.current || !capability || saved) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const closed = stopVoice.current ? await stopVoice.current() : true;
      if (!alive.current) return;
      if (!closed)
        throw new Error("Close voice capture before saving this draft.");
      const card = spokenTaskDraft(title, duty, words, workType);
      const result = await runPendingEarnCommand("create-draft", card, (key) =>
        repo.createDraftFromTask(card, key),
      );
      if (!alive.current) return;
      if (result.refused.length)
        throw new Error(result.refused.map((item) => item.message).join(" "));
      if (!result.drafts.length)
        throw new Error("No draft was saved. Review this task and try again.");
      setSaved(true);
    } catch (e) {
      if (alive.current)
        setError(
          (e as Error).message || "The draft could not be saved. Try again.",
        );
    } finally {
      pending.current = false;
      if (alive.current) setBusy(false);
    }
  };
  if (capabilityError)
    return <ErrorState error={capabilityError} onRetry={check} />;
  if (capability === null)
    return <LoadingState label="Checking this connection…" />;
  if (!capability)
    return (
      <Screen>
        <Heading>Say a task out loud</Heading>
        <Text>
          Saving a new Task Card here is not turned on for this connection yet.
        </Text>
        <Text>
          Use My work in the web app to type or upload a card. Your existing
          phone questions still work.
        </Text>
        <Button
          label="Back to My work"
          onPress={() => router.replace("/earn/drafts")}
        />
      </Screen>
    );
  if (saved)
    return (
      <Screen>
        <Heading>Draft saved</Heading>
        <Text>
          Your Task Card is still a draft. Open My work to check it before
          you confirm it.
        </Text>
        <Button
          label="Open My work"
          kind="primary"
          onPress={() => router.replace("/earn/drafts")}
        />
      </Screen>
    );
  const fieldStyle = {
    color: c.ink,
    backgroundColor: c.surface,
    borderColor: c.line,
    borderWidth: 1,
    borderRadius: radius.button,
    padding: spacing.md,
    fontSize: 16,
  };
  return (
    <Screen>
      <Heading>Say a task out loud</Heading>
      <Text>
        Describe one task. Type instead at any time. Review the words before
        saving.
      </Text>
      <View style={{ gap: spacing.md }}>
        <Text variant="metaStrong">Task name</Text>
        <TextInput
          accessibilityLabel="Task name"
          value={title}
          maxLength={120}
          editable={!busy}
          onChangeText={setTitle}
          placeholder="Start with a verb."
          placeholderTextColor={c.faint}
          style={fieldStyle}
        />
        <Text variant="metaStrong">Part of my job</Text>
        <TextInput
          accessibilityLabel="Part of my job"
          value={duty}
          maxLength={200}
          editable={!busy}
          onChangeText={setDuty}
          placeholder="The duty this task belongs to."
          placeholderTextColor={c.faint}
          style={fieldStyle}
        />
        <Text variant="metaStrong">
          Work type:{" "}
          {workType === "manual"
            ? "Hands-on work"
            : workType === "digital"
              ? "Computer work"
              : "Both"}
        </Text>
        {(["manual", "digital", "mixed"] as const).map((kind) => (
          <Button
            key={kind}
            label={
              kind === "manual"
                ? "Hands-on work"
                : kind === "digital"
                  ? "Computer work"
                  : "Both"
            }
            disabled={busy}
            onPress={() => setWorkType(kind)}
          />
        ))}
        <VoiceField
          label="Task words"
          value={words}
          onChange={setWords}
          disabled={busy}
          stopHandle={stopVoice}
        />
        <Text variant="small" color="muted">
          Only your words fill the Does slot. Unknown places, tools, steps and
          hand-offs stay Not stated.
        </Text>
        <Text variant="small" color="amber">
          Remove private details before saving. Saving does not confirm this
          card or approve payment.
        </Text>
        {error ? (
          <Text accessibilityRole="alert" color="red">
            {error}
          </Text>
        ) : null}
        <Button
          label="Save app draft"
          kind="primary"
          loading={busy}
          disabled={!title.trim() || !duty.trim() || !words.trim()}
          onPress={() => void save()}
        />
      </View>
    </Screen>
  );
}
