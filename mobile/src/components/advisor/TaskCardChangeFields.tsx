import React from "react";
import { View } from "react-native";
import { SectionLabel } from "@/components/common";
import { Field, ListRow, Notice } from "./Parts";
import type {
  MeetingProposal,
  MeetingTaskCardWire,
  Person,
} from "@/api/advisor";
export type TaskCardChange = Extract<
  MeetingProposal["body"],
  { kind: "task_card_delta" }
>;
export function taskCardFieldValue(
  card: MeetingTaskCardWire,
  field: TaskCardChange["field"],
): string {
  if (field === "title") return card.title;
  const value = card.data[field];
  return Array.isArray(value) ? value.join("\n") : String(value ?? "");
}
/** The user selects identities from the scoped records; UUID text is never an owner editor. */
export function TaskCardChangeFields({
  value,
  cards,
  people,
  busy,
  onChange,
}: {
  value: TaskCardChange;
  cards: MeetingTaskCardWire[];
  people: Person[];
  busy: boolean;
  onChange(value: TaskCardChange): void;
}) {
  const select = (card: MeetingTaskCardWire | null) =>
    onChange({
      ...value,
      taskCardId: card?.id ?? null,
      from: card ? taskCardFieldValue(card, value.field) : null,
    });
  return (
    <View>
      <SectionLabel>Task Card to change</SectionLabel>
      <ListRow
        title="New Task Card"
        selected={!value.taskCardId}
        onPress={!busy ? () => select(null) : undefined}
      />
      {cards.map((card) => (
        <ListRow
          key={card.id}
          title={card.title}
          detail={card.id}
          selected={card.id === value.taskCardId}
          onPress={!busy ? () => select(card) : undefined}
        />
      ))}
      <SectionLabel>Person whose work changes</SectionLabel>
      {people.map((person) => (
        <ListRow
          key={person.id}
          title={person.name}
          detail={person.role}
          selected={value.personKey === person.id}
          onPress={
            !busy
              ? () => onChange({ ...value, personKey: person.id })
              : undefined
          }
        />
      ))}
      {!people.length ? (
        <Notice>
          Add a named attendee before proposing Task Card changes.
        </Notice>
      ) : null}
      <Notice>
        Field: {value.field === "ownerId" ? "Owner" : value.field}. Current
        value:{" "}
        {value.field === "ownerId" && value.from
          ? (people.find((person) => person.id === value.from)?.name ??
            "Owner not in this attendee list")
          : (value.from ?? "New Task Card")}
      </Notice>
      {value.field === "ownerId" ? (
        <View>
          <SectionLabel>New Task Card owner</SectionLabel>
          {people.map((person) => (
            <ListRow
              key={person.id}
              title={`Owner: ${person.name}`}
              selected={value.to === person.id}
              onPress={
                !busy ? () => onChange({ ...value, to: person.id }) : undefined
              }
            />
          ))}
        </View>
      ) : (
        <Field
          label="Proposed Task Card value"
          editable={!busy}
          value={value.to}
          onChange={(to) => onChange({ ...value, to })}
          maxLength={6000}
        />
      )}
    </View>
  );
}
