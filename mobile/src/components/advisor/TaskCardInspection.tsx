import React, { useState } from "react";
import { View } from "react-native";
import { Button, Text } from "@/components/common";
import type { MeetingTaskCardWire } from "@/api/advisor";
const labels: Record<string, string> = {
  title: "Title",
  duty: "Duty",
  ownerId: "Owner",
  performerId: "Performer",
  purpose: "Purpose",
  trigger: "Trigger",
  inputs: "Inputs",
  instructions: "Steps",
  output: "Output",
  systems: "Systems",
  humanGate: "Human check",
  destination: "Handoff",
  mode: "Mode",
};
/** Company-scoped advisor reads only. This never edits or accepts a record. */
export function TaskCardInspection({
  id,
  title,
  draft = false,
  people,
  load,
}: {
  id: string;
  title?: string;
  draft?: boolean;
  people: Record<string, string>;
  load?(id: string): Promise<MeetingTaskCardWire>;
}) {
  const [record, setRecord] = useState<MeetingTaskCardWire | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <View>
      <Text variant="metaStrong">
        {draft ? "Saved draft" : "Linked Task Card"}:{" "}
        {record?.title ?? title ?? "Title not loaded"}
      </Text>
      <Text variant="small" color="muted">
        {id}
      </Text>
      <Button
        label={
          expanded
            ? draft
              ? "Hide saved draft"
              : "Hide linked Task Card"
            : draft
              ? "View saved draft"
              : "View linked Task Card"
        }
        loading={loading}
        disabled={!load}
        onPress={async () => {
          if (expanded) {
            setExpanded(false);
            return;
          }
          setFailed(false);
          if (record) {
            setExpanded(true);
            return;
          }
          if (!load) return;
          setLoading(true);
          try {
            const next = await load(id);
            if (next.id !== id) throw new Error("Task Card identity changed.");
            setRecord(next);
            setExpanded(true);
          } catch {
            setFailed(true);
          } finally {
            setLoading(false);
          }
        }}
      />
      {failed ? (
        <Text variant="meta" color="amber">
          This Task Card could not be loaded. Retry the view action. Keep the
          proposal unchanged.
        </Text>
      ) : null}
      {expanded && record ? (
        <View>
          <Text variant="meta" color="muted">
            Read only · {record.state} · Version {record.version}
          </Text>
          {Object.entries(record.data).map(([field, value]) => (
            <View key={field} style={{ marginVertical: 5 }}>
              <Text variant="metaStrong">{labels[field] ?? field}</Text>
              <Text>
                {["ownerId", "performerId"].includes(field) &&
                typeof value === "string"
                  ? (people[value] ?? value) || "Not stated"
                  : Array.isArray(value)
                    ? value.join(", ") || "Not stated"
                    : String(value ?? "") || "Not stated"}
              </Text>
            </View>
          ))}
          {draft ? (
            <Text variant="meta" color="muted">
              This saved draft is separate from the proposal. Review further
              changes through the draft record.
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
