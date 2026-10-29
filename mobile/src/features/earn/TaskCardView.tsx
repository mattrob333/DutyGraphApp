import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { Button, Card, SectionLabel, Text } from "@/components/common";
import type {
  DraftChecks,
  SlotKey,
  TaskCardDraftInput,
} from "@/api/earn/types";
import { useColors } from "@/theme";
import { WorkBand, WorkChip } from "./Gallery";
import { draftReason, SLOT_KEYS, SLOT_LABELS, slotMissing } from "./logic";
export function EarnTaskCardView({
  card,
  checks,
  name = "You",
  payRulesNote = "Your company's pay rules apply.",
  onAddSlot,
  editDisabled = false,
}: {
  card: TaskCardDraftInput;
  checks?: DraftChecks;
  name?: string;
  payRulesNote?: string;
  onAddSlot?: (slot: SlotKey) => void;
  editDisabled?: boolean;
}) {
  const c = useColors(),
    [ticks, setTicks] = useState<Record<number, boolean>>({});
  return (
    <View style={{ gap: 12 }}>
      <View style={{ borderRadius: 4, overflow: "hidden" }}>
        <WorkBand type={card.workType} height={7} />
      </View>
      <WorkChip type={card.workType} long />
      <Text variant="title" accessibilityRole="header">
        {card.title}
      </Text>
      <Text>{card.duty}</Text>
      <Text variant="meta" color="muted">
        by {name} ·{" "}
        {card.kind === "proposed" ? "Proposed work" : "How I work today"}
      </Text>
      <Card level="surface">
        <Text variant="meta">Gets from → Does → Hands to</Text>
        <Text>
          {["getsFrom", "does", "handsTo"]
            .map((key) =>
              slotMissing(card, key as keyof typeof card.slots)
                ? "Not stated"
                : card.slots[key as keyof typeof card.slots].value,
            )
            .join(" → ")}
        </Text>
      </Card>
      {SLOT_KEYS.map((key) => (
        <View key={key}>
          <Text variant="metaStrong" color="muted">
            {SLOT_LABELS[key]}
          </Text>
          <Text color={slotMissing(card, key) ? "amber" : "ink"}>
            {slotMissing(card, key) ? "Not stated" : card.slots[key].value}
          </Text>
          {onAddSlot && (
            <Button
              label={`${slotMissing(card, key) ? "Add" : "Edit"} ${SLOT_LABELS[key]}`}
              kind="link"
              disabled={editDisabled}
              onPress={() => onAddSlot(key)}
            />
          )}
          {card.slots[key].suggestion && (
            <Text variant="small" color="muted">
              Suggestion to check: {card.slots[key].suggestion}
            </Text>
          )}
        </View>
      ))}
      <SectionLabel>How to do this task</SectionLabel>
      {card.steps.length === 0 && <Text color="amber">Not stated</Text>}
      {card.steps.map((raw, i) => {
        const step = typeof raw === "string" ? { do: raw } : raw;
        return (
          <Card key={i} level="surface">
            <Pressable
              accessibilityRole="checkbox"
              accessibilityLabel={`Step ${i + 1}: ${step.do}`}
              accessibilityState={{ checked: !!ticks[i] }}
              aria-checked={!!ticks[i]}
              onPress={() => setTicks((v) => ({ ...v, [i]: !v[i] }))}
              style={{ minHeight: 44, justifyContent: "center" }}
            >
              <Text variant="bodyStrong">
                {ticks[i] ? "☑" : "☐"} {i + 1}. {step.do}
              </Text>
            </Pressable>
            {!!step.where && <Text>Place: {step.where}</Text>}
            {step.tool && (
              <Text>
                Tool: {step.tool.name}
                {step.tool.getFrom
                  ? ` · Get it from: ${step.tool.getFrom}`
                  : ""}
              </Text>
            )}
            {step.materials?.map((m, j) => (
              <Text key={j}>
                Material: {m.name}
                {m.getFrom ? ` · Get it from: ${m.getFrom}` : ""}
              </Text>
            ))}
            {step.minutes !== undefined && <Text>{step.minutes} minutes</Text>}
            {!!step.watchFor && <Text>Watch for: {step.watchFor}</Text>}
            {!!step.safety && (
              <View
                style={{
                  backgroundColor: c.amberBg,
                  padding: 12,
                  borderRadius: 8,
                  marginTop: 8,
                }}
              >
                <Text color="amber">Safety: {step.safety}</Text>
              </View>
            )}
          </Card>
        );
      })}
      <Text variant="small" color="muted">
        Tick boxes stay on this screen. They do not record completion.
      </Text>
      <Text>Done means: {card.doneMeans || "Not stated"}</Text>
      {card.tools?.length ? <Text>Tools: {card.tools.join(", ")}</Text> : null}
      {!!card.whereThingsAre?.length && (
        <>
          <SectionLabel>Where things are</SectionLabel>
          {card.whereThingsAre.map((item, i) => (
            <Text key={i}>
              {item.item}: {item.place}
            </Text>
          ))}
        </>
      )}
      {!!card.safety?.length && (
        <View
          style={{ backgroundColor: c.amberBg, padding: 14, borderRadius: 8 }}
        >
          <Text variant="bodyStrong" color="amber">
            Safety
          </Text>
          {card.safety.map((line, i) => (
            <Text key={i} color="amber">
              {line}
            </Text>
          ))}
          <Text color="amber" variant="small">
            Follow your company's safety procedures. This card does not replace
            them.
          </Text>
        </View>
      )}
      {!!card.approvalsAndRules && (
        <>
          <SectionLabel>Approvals and rules</SectionLabel>
          <Text>{card.approvalsAndRules}</Text>
        </>
      )}
      {!!card.aiIAlreadyUse && (
        <>
          <SectionLabel>AI I already use</SectionLabel>
          <Text
            selectable
            style={{
              fontFamily: "monospace",
              padding: 12,
              backgroundColor: c.surface,
              borderRadius: 8,
            }}
          >
            {card.aiIAlreadyUse}
          </Text>
        </>
      )}
      {card.links && (
        <>
          <SectionLabel>How this serves the team</SectionLabel>
          {Object.entries(card.links).map(([label, value]) => (
            <Text key={label}>
              {label.replace(/([A-Z])/g, " $1")}: {value || "Not stated"}
            </Text>
          ))}
        </>
      )}
      {card.impact && (
        <Text>
          Team measure: {card.impact.measure || "Not stated"}
          {card.impact.how ? ` · ${card.impact.how}` : ""}
        </Text>
      )}
      {card.money && (
        <Card level="surface">
          <Text variant="bodyStrong">Moves money</Text>
          <Text>Kind: {card.money.kind.replaceAll("_", " ")}</Text>
          <Text>System: {card.money.system || "Not stated"}</Text>
          {!!card.money.typicalAmount && (
            <>
              <Text>Typical amount: {card.money.typicalAmount}</Text>
              <Text variant="small" color="muted">
                {payRulesNote}
              </Text>
            </>
          )}
          {!!card.money.limit && (
            <>
              <Text>Limit: {card.money.limit}</Text>
              <Text variant="small" color="muted">
                {payRulesNote}
              </Text>
            </>
          )}
          <Text>Approver: {card.money.approver || "Not stated"}</Text>
        </Card>
      )}
      {checks && (
        <Card level="surface">
          <Text variant="bodyStrong">
            {checks.readyToHandOff
              ? "Ready to hand off"
              : `${checks.emptySlots.length} slots to fill`}
          </Text>
          {checks.earnHint !== "off" && (
            <Text>
              {checks.earnHint === "likely"
                ? "Likely to earn"
                : "Will not earn yet"}
              . The manager decides after you confirm.
            </Text>
          )}
          {draftReason(checks).map((reason, i) => (
            <Text key={i}>{reason}</Text>
          ))}
          {checks.possibleDuplicates.map((item) => (
            <Text key={item.id}>
              Looks like {item.ownerName}'s card '{item.title}'
            </Text>
          ))}
          {checks.secretsRemoved > 0 && (
            <Text color="amber">
              {checks.secretsRemoved} private values were removed.
            </Text>
          )}
        </Card>
      )}
    </View>
  );
}
