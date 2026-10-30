import React from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/common";
import { radius, useColors, type ColorTokens } from "@/theme";
import type { WorkType } from "@/api/earn/types";
import {
  GALLERY_FILTERS,
  WORK_TYPE_LABELS,
  type AiRow,
  type CardStatus,
  type GalleryFilter,
} from "./gallery-logic";

/** Colors per work type, from the shared web/phone spec. */
export function workTypeColors(c: ColorTokens, type: WorkType) {
  if (type === "manual") return { fg: c.amber, bg: c.amberBg, band: [c.amber] };
  if (type === "digital") return { fg: c.blue, bg: c.blueBg, band: [c.blue] };
  return { fg: c.lilac, bg: c.lilacBg, band: [c.amber, c.blue] };
}

/** The top band: one color, or half amber and half blue for Mixed (a hard stop, not a fade). */
export function WorkBand({ type, height = 5 }: { type: WorkType; height?: number }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: "row", height }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {workTypeColors(c, type).band.map((color, i) => (
        <View key={i} style={{ flex: 1, backgroundColor: color }} />
      ))}
    </View>
  );
}

export function WorkChip({ type, long }: { type: WorkType; long?: boolean }) {
  const c = useColors();
  const t = workTypeColors(c, type);
  const label =
    long && type === "mixed" ? "Mixed: hands-on and AI help" : WORK_TYPE_LABELS[type];
  return (
    <View style={{ alignSelf: "flex-start", backgroundColor: t.bg, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 }}>
      <Text variant="chip" style={{ color: t.fg }}>
        {label}
      </Text>
    </View>
  );
}

export function StatusTag({ status }: { status: CardStatus }) {
  const c = useColors();
  if (status.kind === "new")
    return (
      <View style={{ backgroundColor: c.sage, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 1 }}>
        <Text variant="chip" style={{ color: c.bg }}>
          New
        </Text>
      </View>
    );
  return (
    <Text variant="chip" style={{ color: status.kind === "check" ? c.amber : c.sage }}>
      {status.label}
    </Text>
  );
}

/** One gallery tile: band, chip and status, the title, how often and how long. The whole tile opens the card. */
export function CardTile({
  type,
  title,
  footer,
  status,
  onPress,
}: {
  type: WorkType;
  title: string;
  footer: string;
  status: CardStatus;
  onPress: () => void;
}) {
  const c = useColors();
  const isNew = status.kind === "new";
  return (
    <View
      style={{
        flexBasis: "47%",
        flexGrow: 1,
        borderRadius: radius.card + 3,
        padding: isNew ? 3 : 0,
        backgroundColor: isNew ? c.sage + "2e" : "transparent",
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${WORK_TYPE_LABELS[type]}, ${status.label}`}
        onPress={onPress}
        style={({ pressed }) => ({
          minHeight: 150,
          borderRadius: radius.card,
          borderWidth: 1,
          borderColor: isNew ? c.sage : c.line,
          backgroundColor: pressed ? c.soft : c.surface,
          overflow: "hidden",
        })}
      >
        <WorkBand type={type} />
        <View style={{ flex: 1, padding: 11, gap: 8 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 4 }}>
            <WorkChip type={type} />
            <StatusTag status={status} />
          </View>
          <Text variant="bodyStrong" numberOfLines={4}>
            {title}
          </Text>
          <Text variant="small" color="muted" style={{ marginTop: "auto" }}>
            {footer}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

/** Ten parts: amber while the AI asks, mint when the card is ready. */
export function PartsMeter({ done, of, ready }: { done: number; of: number; ready: boolean }) {
  const c = useColors();
  return (
    <View accessible accessibilityLabel={`${done} of ${of} parts`} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View style={{ flexDirection: "row", gap: 2 }}>
        {Array.from({ length: of }, (_, i) => (
          <View key={i} style={{ width: 4, height: 12, borderRadius: 2, backgroundColor: i < done ? (ready ? c.sage : c.amber) : c.line }} />
        ))}
      </View>
      <Text variant="small" style={{ color: ready ? c.sage : c.muted }}>
        {done}/{of}
      </Text>
    </View>
  );
}

export function AiProgressRow({ row }: { row: AiRow }) {
  const c = useColors();
  const ready = row.stage === "ready";
  return (
    <View
      accessible
      accessibilityLabel={`${row.title}. ${row.line}. ${row.pill}`}
      style={{
        backgroundColor: ready ? c.sageBg : c.surface,
        borderWidth: 1,
        borderColor: ready ? c.sage : c.line,
        borderRadius: radius.card,
        padding: 12,
        gap: 8,
      }}
    >
      <Text variant="bodyStrong">{row.title}</Text>
      <Text variant="meta" color={ready ? "sage" : "muted"}>
        {row.line}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <PartsMeter done={row.done} of={row.of} ready={ready} />
        <View
          style={{
            borderRadius: radius.pill,
            paddingHorizontal: 9,
            paddingVertical: 2,
            borderWidth: 1,
            borderColor: ready ? c.sage : row.stage === "check" ? c.sage : c.amber,
            backgroundColor: ready ? c.sage : "transparent",
          }}
        >
          <Text variant="chip" style={{ color: ready ? c.bg : row.stage === "check" ? c.sage : c.amber }}>
            {row.pill}
          </Text>
        </View>
      </View>
    </View>
  );
}

export function GalleryFilters({
  value,
  counts,
  onChange,
}: {
  value: GalleryFilter;
  counts: Record<GalleryFilter, number>;
  onChange: (value: GalleryFilter) => void;
}) {
  const c = useColors();
  const tint: Record<GalleryFilter, string> = { all: c.ink, manual: c.amber, digital: c.blue, mixed: c.lilac };
  return (
    <View accessibilityLabel="Show" style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      {GALLERY_FILTERS.map((f) => {
        const on = f.key === value;
        return (
          <Pressable
            key={f.key}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${f.label}, ${counts[f.key]}`}
            onPress={() => onChange(f.key)}
            style={{
              minHeight: 36,
              justifyContent: "center",
              borderRadius: radius.pill,
              paddingHorizontal: 12,
              borderWidth: 1,
              borderColor: on ? c.faint : c.line,
              backgroundColor: on ? c.soft : "transparent",
            }}
          >
            <Text variant="chip" style={{ color: tint[f.key] }}>
              {f.label} <Text variant="chip" color="muted">{counts[f.key]}</Text>
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Connect your AI folded to one line once an AI app has used the connector. */
export function ConnectedLine({ app, onShowSteps }: { app: string; onShowSteps: () => void }) {
  const c = useColors();
  return (
    <View
      style={{
        alignItems: "flex-start",
        gap: 2,
        borderWidth: 1,
        borderColor: c.sage,
        backgroundColor: c.sageBg,
        borderRadius: radius.button + 1,
        paddingHorizontal: 12,
        paddingVertical: 8,
      }}
    >
      <Text>
        <Text color="sage" variant="bodyStrong">✓ </Text>
        Connected to {app}. In a new chat, type <Text variant="bodyStrong">Find my work</Text>.
      </Text>
      <Pressable accessibilityRole="link" onPress={onShowSteps} style={{ minHeight: 44, justifyContent: "center" }}>
        <Text color="sage" style={{ textDecorationLine: "underline" }}>
          Show the connect steps
        </Text>
      </Pressable>
    </View>
  );
}
