import React, { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { Button, Card, Text } from "@/components/common";
import { radius, touch, typography, useColors } from "@/theme";

export function Row({
  title,
  subtitle,
  right,
  onPress,
  disabled = false,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  const c = useColors();
  const content = (
    <>
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong">{title}</Text>
        {subtitle ? (
          <Text variant="meta" color="muted">
            {subtitle}
          </Text>
        ) : null}
        {children}
      </View>
      {typeof right === "string" ? (
        <Text variant="meta" color="muted">
          {right}
        </Text>
      ) : (
        right
      )}
      {onPress ? <Text color="faint">›</Text> : null}
    </>
  );
  const style = {
    minHeight: 56,
    paddingVertical: 12,
    gap: 12,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    borderBottomWidth: 1,
    borderBottomColor: c.line,
    opacity: disabled ? 0.5 : 1,
  };
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={style}
    >
      {content}
    </Pressable>
  ) : (
    <View style={style}>{content}</View>
  );
}
export function SectionHeader({
  title,
  count,
}: {
  title: string;
  count?: number;
}) {
  return (
    <Text
      variant="label"
      color="faint"
      accessibilityRole="header"
      style={{ marginTop: 22, marginBottom: 10 }}
    >
      {title}
      {count === undefined ? "" : ` · ${count}`}
    </Text>
  );
}
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  disabled = false,
  accessibilityLabel,
}: {
  options: { value: T; label: string; disabled?: boolean }[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const c = useColors();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 4,
        borderRadius: radius.button,
        backgroundColor: c.soft,
        padding: 4,
      }}
    >
      {options.map((o) => (
        <Pressable
          key={o.value}
          accessibilityRole="radio"
          accessibilityLabel={o.label}
          accessibilityState={{
            checked: value === o.value,
            disabled: disabled || o.disabled,
          }}
          disabled={disabled || o.disabled}
          onPress={() => onChange(o.value)}
          style={{
            flex: 1,
            minWidth: 70,
            minHeight: touch.min,
            justifyContent: "center",
            alignItems: "center",
            borderRadius: radius.button,
            backgroundColor: value === o.value ? c.surface : c.soft,
            opacity: disabled || o.disabled ? 0.5 : 1,
            padding: 8,
          }}
        >
          <Text variant="metaStrong">{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
export function PersonChip({
  name,
  role,
  selected = false,
  consent,
  onPress,
}: {
  name: string;
  role?: string;
  selected?: boolean;
  consent?: "consented" | "declined" | "pending";
  onPress?: () => void;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : "text"}
      accessibilityLabel={`${name}${role ? `, ${role}` : ""}${consent ? `, ${consent}` : ""}`}
      accessibilityState={{ selected }}
      onPress={onPress}
      disabled={!onPress}
      style={{
        minHeight: touch.min,
        padding: 10,
        borderRadius: radius.chip,
        backgroundColor:
          consent === "consented" ? c.sageBg : selected ? c.violetBg : c.soft,
        alignSelf: "flex-start",
      }}
    >
      <Text
        variant="metaStrong"
        color={consent === "consented" ? "sage" : "ink"}
        style={
          consent === "declined"
            ? { textDecorationLine: "line-through" }
            : undefined
        }
      >
        {consent === "consented" ? "✓ " : ""}
        {name}
      </Text>
      {role ? (
        <Text variant="small" color="muted">
          {role}
        </Text>
      ) : null}
    </Pressable>
  );
}
export function TimerRing({
  elapsedSeconds,
  totalSeconds,
}: {
  elapsedSeconds: number;
  totalSeconds: number;
}) {
  const c = useColors();
  const left = Math.max(0, Math.ceil(totalSeconds - elapsedSeconds));
  const over = elapsedSeconds >= totalSeconds;
  const urgent = elapsedSeconds / Math.max(1, totalSeconds) >= 0.8;
  const label = over
    ? "Time is up"
    : `${Math.floor(left / 60)}:${String(Math.ceil(left % 60)).padStart(2, "0")} left`;
  return (
    <View
      accessible
      accessibilityRole="timer"
      accessibilityLabel={label}
      style={{
        alignSelf: "flex-start",
        minHeight: 36,
        paddingHorizontal: 14,
        paddingVertical: 6,
        marginVertical: 8,
        justifyContent: "center",
        alignItems: "center",
        borderRadius: radius.pill,
        borderWidth: 1.5,
        borderColor: over ? c.red : urgent ? c.amber : c.sage,
      }}
    >
      <Text
        variant="metaStrong"
        color={over ? "red" : urgent ? "amber" : "sage"}
      >
        {label}
      </Text>
    </View>
  );
}
export function RecordingIndicator({
  state = "recording",
  elapsedSeconds = 0,
}: {
  state?: "recording" | "paused" | "uploading" | "offline-saved";
  elapsedSeconds?: number;
}) {
  const label = {
    recording: "Recording",
    paused: "Recording paused",
    uploading: "Uploading recording",
    "offline-saved": "Recording saved on this phone",
  }[state];
  const elapsed = `${Math.floor(elapsedSeconds / 60)}:${String(Math.floor(elapsedSeconds % 60)).padStart(2, "0")}`;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
      <Text
        variant="metaStrong"
        color={state === "recording" ? "red" : "muted"}
        accessibilityLiveRegion="polite"
      >
        {state === "recording" ? "● " : ""}
        {label}
      </Text>
      <Text
        variant="metaStrong"
        color="muted"
        accessibilityLabel={`Elapsed recording time ${elapsed}`}
      >
        {" "}
        · {elapsed}
      </Text>
    </View>
  );
}
export function SpeakingIndicator({ muted = false }: { muted?: boolean }) {
  return (
    <Text
      variant="metaStrong"
      color={muted ? "muted" : "violet"}
      accessibilityLiveRegion="polite"
    >
      {muted ? "Voice muted" : "◖ Speaking…"}
    </Text>
  );
}
export function ConsentRow({
  name,
  state,
  onChange,
}: {
  name: string;
  state: "pending" | "consented" | "declined";
  onChange: (v: "consented" | "declined") => void;
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Row
        title={name}
        subtitle={
          state === "pending"
            ? "Consent needed"
            : state === "consented"
              ? "Consented to recording"
              : "Declined · excluded from recording"
        }
      />
      <SegmentedControl
        accessibilityLabel={`Recording consent for ${name}`}
        options={[
          { value: "consented", label: "Consent" },
          { value: "declined", label: "Declined" },
        ]}
        value={state}
        onChange={(v) => v !== "pending" && onChange(v)}
      />
    </View>
  );
}
export function ProposalCard({
  title,
  body,
  status = "proposed",
  speaker,
  quote,
  timestamp,
  onPlay,
  onAccept,
  onReject,
  onEdit,
  children,
}: {
  title: string;
  body?: string;
  status?: "proposed" | "accepted" | "rejected" | "stale";
  speaker?: string;
  quote?: string;
  timestamp?: string;
  onPlay?: () => void;
  onAccept?: () => void;
  onReject?: () => void;
  onEdit?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <Card
      tone={
        status === "accepted" ? "sage" : status === "stale" ? "amber" : "violet"
      }
    >
      <Text
        variant="label"
        color={
          status === "accepted"
            ? "sage"
            : status === "stale"
              ? "amber"
              : "violet"
        }
      >
        {status === "stale"
          ? "The transcript changed. Check this again."
          : status}
      </Text>
      <Text variant="cardTitle">{title}</Text>
      {body ? (
        <Text
          style={
            status === "rejected"
              ? { textDecorationLine: "line-through" }
              : undefined
          }
        >
          {body}
        </Text>
      ) : null}
      {children}
      {quote ? (
        <View style={{ marginTop: 12 }}>
          <Text variant="metaStrong">{speaker || "Unknown speaker"}</Text>
          <Text color="muted">“{quote}”</Text>
          {timestamp ? (
            <Button
              label={timestamp}
              kind="link"
              onPress={onPlay}
              disabled={!onPlay}
            />
          ) : null}
        </View>
      ) : null}
      <View style={{ gap: 8, marginTop: 12 }}>
        {onAccept ? <Button label="Accept" onPress={onAccept} /> : null}
        {onEdit ? <Button label="Edit" onPress={onEdit} /> : null}
        {onReject ? <Button label="Reject" onPress={onReject} /> : null}
      </View>
    </Card>
  );
}
export type TaskDecision = "correct" | "needs_change" | "not_mine" | "unsure";
export type TaskData = {
  title?: string;
  duty?: unknown;
  purpose?: unknown;
  trigger?: unknown;
  inputs?: unknown;
  instructions?: unknown;
  systems?: unknown;
  software?: unknown;
  output?: unknown;
  destination?: unknown;
  handoff?: unknown;
  humanGate?: unknown;
};
export const TASK_CHOICES: { value: TaskDecision; label: string }[] = [
  { value: "correct", label: "This is right" },
  { value: "needs_change", label: "Needs a change" },
  { value: "not_mine", label: "Not my work" },
  { value: "unsure", label: "Not sure" },
];
export function taskValue(value: unknown): string {
  return Array.isArray(value)
    ? value.map(taskValue).join("\n")
    : typeof value === "string"
      ? value
      : value && typeof value === "object"
        ? Object.values(value).map(taskValue).filter(Boolean).join(" · ")
        : "";
}
export function taskRows(data: TaskData) {
  return [
    ["Duty", data.duty],
    ["Purpose", data.purpose],
    ["Starts when", data.trigger],
    ["You receive", data.inputs],
    ["Steps", data.instructions],
    ["Systems", data.systems ?? data.software],
    ["Result", data.output],
    ["Goes to", data.destination ?? data.handoff],
    ["Checks and approvals", data.humanGate],
  ].map(([label, v]) => ({
    label: label as string,
    value:
      taskValue(v) || "Not stated in your answer. Review it with your advisor.",
  }));
}
export function TaskCardView({
  data,
  person,
  decision,
  note = "",
  onDecision,
  onNote,
  onRead,
  disabled = false,
}: {
  data: TaskData;
  person?: string;
  decision?: TaskDecision;
  note?: string;
  onDecision?: (v: TaskDecision) => void;
  onNote?: (v: string) => void;
  onRead?: () => void;
  disabled?: boolean;
}) {
  const c = useColors();
  return (
    <Card>
      <Text variant="label" color="faint">
        My work · Task description
      </Text>
      <Text variant="cardTitle">{data.title || "Your Task Card"}</Text>
      {person ? (
        <Text variant="meta" color="muted">
          {person}
        </Text>
      ) : null}
      <Text
        variant="metaStrong"
        color={decision === "correct" ? "sage" : "muted"}
      >
        {decision === "correct"
          ? "✓ Confirmed · ready to send"
          : decision
            ? `${TASK_CHOICES.find((x) => x.value === decision)?.label} · ready to send`
            : "Ready for your review"}
      </Text>
      {onRead ? (
        <Button
          label="Read this Task Card aloud"
          kind="link"
          onPress={onRead}
        />
      ) : null}
      {taskRows(data).map((r) => (
        <View
          key={r.label}
          style={{
            paddingVertical: 10,
            borderBottomWidth: 1,
            borderBottomColor: c.line,
          }}
        >
          <Text variant="metaStrong" color="muted">
            {r.label}
          </Text>
          <Text>{r.value}</Text>
        </View>
      ))}
      {onDecision ? (
        <View accessibilityRole="radiogroup" style={{ marginTop: 12 }}>
          {TASK_CHOICES.map((x) => (
            <Pressable
              key={x.value}
              accessibilityRole="radio"
              accessibilityLabel={x.label}
              accessibilityState={{ checked: decision === x.value, disabled }}
              disabled={disabled}
              onPress={() => onDecision(x.value)}
              style={{
                minHeight: touch.min,
                justifyContent: "center",
                padding: 10,
                borderWidth: 1,
                borderColor: decision === x.value ? c.sage : c.line,
                borderRadius: radius.button,
                marginBottom: 8,
              }}
            >
              <Text>
                {decision === x.value ? "◉ " : "○ "}
                {x.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {onNote ? (
        <TextInput
          accessibilityLabel="Add a note (optional)"
          placeholder="Add a note (optional)"
          placeholderTextColor={c.faint}
          multiline
          editable={!disabled}
          maxLength={1000}
          value={note}
          onChangeText={onNote}
          style={{
            ...typography.body,
            minHeight: 70,
            color: c.ink,
            padding: 12,
            borderWidth: 1,
            borderColor: c.line,
            borderRadius: radius.button,
          }}
        />
      ) : note ? (
        <Text color="muted">{note}</Text>
      ) : null}
    </Card>
  );
}
export type AnswerSource =
  "typed" | "voice_device" | "voice_browser" | "voice_openai";
export function AnswerCard({
  title,
  value = "",
  raw = "",
  onChange,
  source,
  edited = false,
  state = "answered",
  reason,
  note,
  onAnswerNow,
  onRetry,
  onRemove,
}: {
  title: string;
  value?: string;
  raw?: string;
  onChange?: (v: string) => void;
  source?: AnswerSource;
  edited?: boolean;
  state?: "answered" | "skipped" | "recording-pending" | "recording-failed";
  reason?: string;
  note?: string | null;
  onAnswerNow?: () => void;
  onRetry?: () => void;
  onRemove?: () => void;
}) {
  const c = useColors();
  const [showRaw, setShowRaw] = useState(false);
  const line =
    source === "voice_openai"
      ? "Transcribed with OpenAI"
      : source === "voice_browser"
        ? "Transcribed with your browser"
        : source === "voice_device"
          ? "Transcribed from voice on your phone"
          : "";
  return (
    <View
      style={{
        backgroundColor: c.raised,
        borderWidth: 1,
        borderColor: c.line,
        borderRadius: radius.card,
        padding: 18,
        marginBottom: 12,
      }}
    >
      <Text
        accessibilityRole="header"
        variant="label"
        color="faint"
        style={{ marginBottom: 10 }}
      >
        {title}
      </Text>
      {state === "skipped" ? (
        <>
          <Text color="muted">
            You skipped this:{" "}
            <Text color="muted">{reason || "Skip this one"}</Text>
          </Text>
          {onAnswerNow ? (
            <Button label="Answer now" kind="link" onPress={onAnswerNow} />
          ) : null}
        </>
      ) : state === "recording-pending" || state === "recording-failed" ? (
        <>
          <Text color={state === "recording-failed" ? "amber" : "muted"}>
            {state === "recording-pending"
              ? "Transcribing your recording…"
              : "Your recording is saved. The words are not ready yet."}
          </Text>
          {onRetry ? (
            <Button label="Try transcription again" onPress={onRetry} />
          ) : null}
          {onChange ? (
            <TextInput
              accessibilityLabel={`Type your answer to: ${title}`}
              value={value}
              onChangeText={onChange}
              multiline
              style={{ ...typography.body, color: c.ink, minHeight: 80 }}
            />
          ) : null}
          {onRemove ? (
            <Button label="Remove recording" kind="link" onPress={onRemove} />
          ) : null}
        </>
      ) : (
        <>
          <TextInput
            accessibilityLabel={`Your answer to: ${title.trim().replace(/[.?!]+$/, "")}. Editable`}
            multiline
            value={value}
            editable={!!onChange}
            onChangeText={onChange}
            style={{
              ...typography.body,
              minHeight: Math.max(80, Math.ceil(value.length / 34) * 25 + 22),
              color: c.ink,
              backgroundColor: c.surface,
              borderWidth: 1,
              borderColor: c.line,
              borderRadius: radius.button,
              padding: 12,
              textAlignVertical: "top",
            }}
          />
          <Button
            label={showRaw ? "Hide what I said" : "Show what I said"}
            kind="link"
            onPress={() => setShowRaw((v) => !v)}
            accessibilityState={{ expanded: showRaw }}
          />
          {showRaw ? (
            <View
              style={{
                backgroundColor: c.surface,
                padding: 12,
                borderRadius: radius.button,
              }}
            >
              <Text variant="chip" color="faint">
                Your words
              </Text>
              <Text color="muted">{raw || "—"}</Text>
            </View>
          ) : null}
          {line || edited ? (
            <Text variant="small" color="faint">
              {[line, edited ? "Edited" : ""].filter(Boolean).join(" · ")}
            </Text>
          ) : null}
        </>
      )}
      {note ? (
        <View style={{ marginTop: 12 }}>
          <Text variant="chip" color="faint">
            A note for later
          </Text>
          <Text color="muted">{note}</Text>
        </View>
      ) : null}
    </View>
  );
}
export function CoachPanel({
  title,
  question,
  person,
  stillNeeded = [],
  flags = [],
  paused = false,
  onPark,
  children,
}: {
  title: string;
  question?: string;
  person?: string;
  stillNeeded?: string[];
  flags?: string[];
  paused?: boolean;
  onPark?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <Card tone={paused ? "amber" : "plain"}>
      <Text variant="label" color="faint">
        {paused ? "Coach paused · offline" : "Silent coach"}
      </Text>
      <Text variant="metaStrong" color="muted" style={{ marginTop: 6 }}>
        {title}
      </Text>
      {person ? <Text variant="metaStrong">Ask {person}</Text> : null}
      {question ? (
        <Text variant="cardTitle" style={{ marginTop: 6 }}>
          {question}
        </Text>
      ) : null}
      {stillNeeded.length ? (
        <Text color="muted" style={{ marginTop: 8 }}>
          Still needed: {stillNeeded.join(" · ")}
        </Text>
      ) : null}
      {flags.map((f, i) => (
        <Text key={i} color="amber">
          {f}
        </Text>
      ))}
      {children || onPark ? (
        <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
          {children}
          {onPark ? (
            <Button label="Park it" style={{ flex: 1 }} full onPress={onPark} />
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}
export function ParkedList({
  items,
  onPress,
}: {
  items: { id: string; title: string; speaker?: string; time?: string }[];
  onPress?: (id: string) => void;
}) {
  return (
    <View>
      <SectionHeader title="Parked items" count={items.length} />
      {items.length ? (
        items.map((i) => (
          <Row
            key={i.id}
            title={i.title}
            subtitle={i.speaker}
            right={i.time}
            onPress={onPress ? () => onPress(i.id) : undefined}
          />
        ))
      ) : (
        <Text color="muted">No parked items.</Text>
      )}
    </View>
  );
}
export function EmptyState({
  title,
  body,
  action,
  onAction,
}: {
  title: string;
  body?: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={{ paddingVertical: 24 }}>
      <Text variant="bodyStrong">{title}</Text>
      {body ? <Text color="muted">{body}</Text> : null}
      {action && onAction ? (
        <Button label={action} kind="link" onPress={onAction} />
      ) : null}
    </View>
  );
}
