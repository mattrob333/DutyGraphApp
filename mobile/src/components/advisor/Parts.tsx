import React from "react";
import { Pressable, TextInput, View } from "react-native";
import { Button, Card, Text, errorMessage } from "@/components/common";
import { radius, typography, useColors } from "@/theme";
import type { MeetingProposal } from "@/api/advisor";
import { hasInstructionLikeQuote } from "./proposalQuoteWarning";
export function Field({
  label,
  value,
  onChange,
  multiline = true,
  placeholder,
  maxLength = 4000,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
  multiline?: boolean;
  placeholder?: string;
  maxLength?: number;
}) {
  const c = useColors();
  return (
    <View style={{ marginBottom: 16 }}>
      <Text variant="metaStrong" color="muted" style={{ marginBottom: 7 }}>
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        placeholder={placeholder}
        placeholderTextColor={c.faint}
        maxLength={maxLength}
        style={{
          ...typography.body,
          color: c.ink,
          backgroundColor: c.surface,
          borderColor: c.line,
          borderWidth: 1,
          borderRadius: radius.button,
          padding: 12,
          minHeight: multiline ? 100 : 48,
          textAlignVertical: "top",
        }}
      />
    </View>
  );
}
export function ListRow({
  title,
  detail,
  onPress,
  selected = false,
}: {
  title: string;
  detail?: string;
  onPress?: () => void;
  selected?: boolean;
}) {
  const c = useColors();
  const contents = (
    <>
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong">{title}</Text>
        {detail ? (
          <Text variant="meta" color="muted">
            {detail}
          </Text>
        ) : null}
      </View>
      {onPress ? (
        <Text color={selected ? "sage" : "muted"}>{selected ? "✓" : "›"}</Text>
      ) : null}
    </>
  );
  const style = {
    minHeight: 64,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    paddingVertical: 12,
    borderBottomColor: c.line,
    borderBottomWidth: 1,
  };
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}${detail ? `, ${detail}` : ""}`}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={style}
    >
      {contents}
    </Pressable>
  ) : (
    <View style={style}>{contents}</View>
  );
}
export function Notice({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "amber" | "sage" | "violet" | "red";
}) {
  return (
    <Text
      color={tone}
      variant="meta"
      accessibilityLiveRegion="polite"
      style={{ marginVertical: 12 }}
    >
      {children}
    </Text>
  );
}
export function CommandError({ error }: { error: unknown }) {
  return error ? (
    <Notice tone="red">
      {error instanceof Error && !("code" in error)
        ? error.message
        : errorMessage(error)}
    </Notice>
  ) : null;
}
/** Human label for a speaker cluster: typed notes are N_<id>, recorded voices get "Speaker 1, 2…". */
export function speakerLabel(
  cluster: string | null | undefined,
  clusters: readonly (string | null | undefined)[] = [],
): string {
  if (!cluster) return "Unknown speaker";
  if (cluster.startsWith("N_")) return "Typed note";
  const voices = [
    ...new Set(clusters.filter((v): v is string => !!v && !v.startsWith("N_"))),
  ];
  const at = voices.indexOf(cluster);
  if (at >= 0) return `Speaker ${at + 1}`;
  const numbered = /^S(\d+)$/.exec(cluster);
  return numbered ? `Speaker ${numbered[1]}` : "Speaker";
}
export const proposalText = (p: MeetingProposal): string => {
  const b = p.body;
  return b.kind === "decision"
    ? b.decision
    : b.kind === "action"
      ? b.what
      : b.kind === "open_question"
        ? b.question
        : b.kind === "claim"
          ? b.value
          : b.kind === "contradiction"
            ? `${b.claimA.text} / ${b.claimB.text}`
            : b.kind === "task_card_delta"
              ? `${b.field}: ${b.from ?? "Not stated"} → ${b.to}`
              : `${b.change}: ${b.duty}`;
};
export function ProposalEvidenceCard({
  proposal,
  people,
  onDecide,
  onEdit,
  busy,
  sourceTimes,
  onSource,
}: {
  proposal: MeetingProposal;
  people: Record<string, string>;
  onDecide(decision: "accept" | "reject"): void;
  onEdit(): void;
  busy?: boolean;
  sourceTimes?: Record<string, number>;
  onSource?: (segmentId: string) => void;
}) {
  const p = proposal,
    accepted = p.state === "accepted",
    stale = p.state === "stale";
  return (
    <Card tone={accepted ? "sage" : stale ? "amber" : "violet"}>
      <Text variant="label" color="muted">
        {p.kind.replace(/_/g, " ")}
      </Text>
      <Text variant="bodyStrong" style={{ marginVertical: 10 }}>
        {proposalText(p)}
      </Text>
      <Text
        variant="metaStrong"
        color={accepted ? "sage" : stale ? "amber" : "violet"}
      >
        {p.state === "proposed"
          ? "Proposed"
          : p.state.charAt(0).toUpperCase() + p.state.slice(1)}
      </Text>
      {p.body.kind === "action" ? (
        <Notice>
          Owner:{" "}
          {p.body.ownerPersonKey
            ? (people[p.body.ownerPersonKey] ?? "Unknown")
            : "Not stated"}{" "}
          · Due: {p.body.due ?? "Not stated"} · {p.body.status}
        </Notice>
      ) : null}
      {p.sources.some((s) => hasInstructionLikeQuote(s.quote)) ? (
        <Notice tone="amber">
          This quote looks like an instruction. Check before accepting.
        </Notice>
      ) : null}
      {p.sources.map((s, i) => (
        <View key={`${s.segmentId}-${i}`} style={{ marginTop: 12 }}>
          <Text variant="metaStrong">
            {s.personKey
              ? (people[s.personKey] ?? "Confirmed speaker")
              : "Unknown speaker"}
          </Text>
          <Text variant="meta" color="muted">
            “{s.quote}”
          </Text>
          {s.revision > 1 ? (
            <Text variant="small" color="faint">
              From a corrected transcript
            </Text>
          ) : null}
          {onSource ? (
            <Button
              label={`Source at ${Math.floor((sourceTimes?.[s.segmentId] ?? 0) / 60000)}:${String(Math.floor(((sourceTimes?.[s.segmentId] ?? 0) % 60000) / 1000)).padStart(2, "0")}`}
              kind="link"
              onPress={() => onSource(s.segmentId)}
            />
          ) : null}
        </View>
      ))}
      {stale ? (
        <Notice tone="amber">The transcript changed. Check this again.</Notice>
      ) : null}
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 8,
          marginTop: 16,
        }}
      >
        <Button
          label="Accept"
          disabled={busy || stale || !p.sources.some((s) => s.personKey)}
          onPress={() => onDecide("accept")}
        />
        <Button label="Edit" disabled={busy} onPress={onEdit} />
        <Button
          label="Reject"
          disabled={busy}
          onPress={() => onDecide("reject")}
        />
      </View>
    </Card>
  );
}
