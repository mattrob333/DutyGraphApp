import React, { useEffect, useState } from "react";
import { View, TextInput } from "react-native";
import { router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useParticipantExtrasRepository,
  type ConfirmationDecisionInput,
  type ParticipantConfirmation,
} from "@/api/extras";
import {
  BottomActionBar,
  Button,
  ErrorState,
  Heading,
  LoadingState,
  Screen,
  Text,
} from "@/components/common";
import { errorMessage } from "@/components/common/States";
import { SegmentedControl } from "@/components/product";
import { useColors, typography, radius } from "@/theme";
import { newIdempotencyKey } from "@/utils/id";
import { qk } from "@/hooks/queries";
import {
  clearTaskReview,
  loadReviewValue,
  saveReviewValue,
} from "@/features/taskCards/reviewStore";
type Draft = {
  choices: Record<
    string,
    { decision: "confirm" | "change" | "not_mine"; note?: string }
  >;
  inputs?: ConfirmationDecisionInput[];
  hash: string;
};
export function WrapUpScreen({ id }: { id: string }) {
  const repo = useParticipantExtrasRepository();
  const q = useQuery({
    queryKey: ["participant-confirmation", id],
    queryFn: () => repo.getConfirmation(id),
  });
  if (q.isPending) return <LoadingState />;
  if (q.isError || !q.data)
    return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  return <WrapUpRun detail={q.data} />;
}
function WrapUpRun({ detail }: { detail: ParticipantConfirmation }) {
  const repo = useParticipantExtrasRepository();
  const qc = useQueryClient();
  const c = useColors();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hash = detail.items
    .map((i) => `${i.id}:${i.version}:${i.hash}`)
    .join("|");
  const storageId = `wrapup:${detail.id}`;
  useEffect(() => {
    let alive = true;
    void loadReviewValue<Draft>(storageId).then((d) => {
      if (alive) setDraft(d?.hash === hash ? d : { choices: {}, hash });
    });
    return () => {
      alive = false;
    };
  }, [storageId, hash]);
  const change = (itemId: string, patch: Partial<Draft["choices"][string]>) => {
    if (!draft) return;
    const next: Draft = {
      choices: {
        ...draft.choices,
        [itemId]: {
          ...draft.choices[itemId],
          decision: draft.choices[itemId]?.decision ?? "change",
          ...patch,
        },
      },
      hash,
    };
    setDraft(next);
    void saveReviewValue(storageId, next).catch((e) =>
      setError(errorMessage(e)),
    );
  };
  const send = async () => {
    if (!draft || sending) return;
    setSending(true);
    setError(null);
    try {
      const inputs =
        draft.inputs ??
        detail.items
          .filter((i) => draft.choices[i.id])
          .map((i) => ({
            id: detail.id,
            itemId: i.id,
            decision: draft.choices[i.id].decision,
            note: draft.choices[i.id].note?.trim() || undefined,
            expectedVersion: i.version,
            contentHash: i.hash,
            idempotencyKey: newIdempotencyKey(),
          }));
      const next = { ...draft, inputs };
      setDraft(next);
      await saveReviewValue(storageId, next);
      for (const input of inputs) await repo.decideConfirmation(input);
      setSent(true);
      await clearTaskReview(storageId);
      void qc.invalidateQueries({ queryKey: qk.today });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  };
  if (!draft) return <LoadingState />;
  if (sent || !detail.items.length)
    return (
      <Screen>
        <Heading>
          {sent ? "Sent. Thank you." : "No items need your review"}
        </Heading>
        <Text color="muted">
          {sent
            ? "Your responses are saved for your advisor to review."
            : "Only the items about your work appear here."}
        </Text>
        <Button
          label="Back to Today"
          onPress={() => router.replace("/today")}
        />
      </Screen>
    );
  const ready = detail.items.every(
    (i) =>
      !!draft.choices[i.id] &&
      (draft.choices[i.id].decision !== "change" ||
        !!draft.choices[i.id].note?.trim()),
  );
  return (
    <Screen
      footer={
        <BottomActionBar>
          <Button
            label={error ? "Try again" : "Send review"}
            kind="primary"
            loading={sending}
            disabled={!ready}
            onPress={() => void send()}
          />
        </BottomActionBar>
      }
    >
      <Text variant="label" color="faint">
        Items about your work
      </Text>
      <Heading>{detail.title}</Heading>
      <Text color="muted" style={{ marginBottom: 18 }}>
        Check each item. Your response is a proposal for your advisor to review.
      </Text>
      {error ? (
        <Text color="red" accessibilityRole="alert">
          {error} Your review is saved on this phone.
        </Text>
      ) : null}
      {detail.items.map((item) => (
        <View
          key={item.id}
          style={{
            padding: 16,
            marginBottom: 16,
            backgroundColor: c.surface,
            borderWidth: 1,
            borderColor: c.line,
            borderRadius: radius.card,
          }}
        >
          <Text style={{ marginBottom: 12 }}>{item.text}</Text>
          <SegmentedControl
            value={draft.choices[item.id]?.decision ?? ""}
            options={[
              { value: "confirm", label: "Confirm" },
              { value: "change", label: "Change" },
              { value: "not_mine", label: "Not mine" },
            ]}
            disabled={sending}
            onChange={(decision) =>
              change(item.id, {
                decision: decision as "confirm" | "change" | "not_mine",
              })
            }
          />
          <TextInput
            accessibilityLabel={`Your note for: ${item.text}`}
            placeholder={
              draft.choices[item.id]?.decision === "change"
                ? "What needs to change?"
                : "Add a note (optional)"
            }
            placeholderTextColor={c.faint}
            multiline
            maxLength={1000}
            editable={!sending}
            value={draft.choices[item.id]?.note ?? ""}
            onChangeText={(note) => change(item.id, { note })}
            style={{
              ...typography.body,
              color: c.ink,
              minHeight: 70,
              marginTop: 12,
              padding: 10,
              borderWidth: 1,
              borderColor: c.line,
              borderRadius: radius.button,
            }}
          />
        </View>
      ))}
    </Screen>
  );
}
