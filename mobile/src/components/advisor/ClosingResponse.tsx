import React, { useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/common";
import { Field } from "./Parts";

export type ClosingResponseState = "confirmed" | "changed" | "not_mine";

/** The meeting leader records the owner's response after reading the item back. */
export function ClosingResponse({
  busy,
  onRespond,
}: {
  busy: boolean;
  onRespond(state: ClosingResponseState, note?: string): void;
}) {
  const [note, setNote] = useState("");
  return (
    <View>
      <Field
        label="What needs to change?"
        placeholder="Add a short note before choosing Change"
        value={note}
        onChange={setNote}
        maxLength={2000}
      />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {(["confirmed", "changed", "not_mine"] as const).map((state) => (
          <Button
            key={state}
            label={state === "confirmed" ? "Confirm" : state === "changed" ? "Change" : "Not mine"}
            loading={busy}
            disabled={state === "changed" && !note.trim()}
            onPress={() => onRespond(state, note.trim() || undefined)}
          />
        ))}
      </View>
    </View>
  );
}
