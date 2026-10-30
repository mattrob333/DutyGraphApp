import React, { useState } from "react";
import { View } from "react-native";
import { Button, Card, Text } from "@/components/common";
import { Notice } from "./Parts";
import type { MeetingGateSuggestionWire } from "@/api/advisor";
const fallback = (status: string) =>
  status === "off"
    ? "AI meeting suggestions are off for this company."
    : status === "over_budget"
      ? "The company’s AI allowance has been reached."
      : status === "rules_required"
        ? "The rules require more planning or an authorized person. AI cannot override that."
        : "An AI suggestion is unavailable. Try again later if needed.";
const choices = {
  avoid: "Avoid the meeting",
  shorten: "Shorten the meeting",
  hold: "Hold the meeting",
} as const;
/** Advice stays separate from the deterministic result and never changes the chosen route. */
export function MeetingGateSuggestion({
  busy,
  onRequest,
}: {
  busy: boolean;
  onRequest(): Promise<MeetingGateSuggestionWire | undefined>;
}) {
  const [result, setResult] = useState<MeetingGateSuggestionWire | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  return (
    <View>
      <Notice>
        Optional AI second opinion. The rules result above still applies. You
        choose the route.
      </Notice>
      <Button
        label="Ask AI for a suggestion"
        disabled={busy}
        loading={busy}
        onPress={async () => {
          setUnavailable(false);
          try {
            const next = await onRequest();
            setResult(next ?? null);
            setUnavailable(!next);
          } catch {
            setResult(null);
            setUnavailable(true);
          }
        }}
      />
      {result?.suggestion ? (
        <Card tone="violet">
          <Text variant="metaStrong">
            {"simulated" in result && result.simulated
              ? "Simulated AI suggestion"
              : "AI suggestion"}
          </Text>
          <Text variant="bodyStrong">
            Suggestion: {choices[result.suggestion.suggestion]}
          </Text>
          <Notice>{result.suggestion.reason}</Notice>
          <Notice>
            This is a suggestion. It does not change the rules result or your
            meeting plan.
          </Notice>
        </Card>
      ) : result ? (
        <Notice>
          {fallback(result.status)} The rules result still applies.
        </Notice>
      ) : null}
      {unavailable ? (
        <Notice>
          An AI suggestion is unavailable. The rules result still applies.
        </Notice>
      ) : null}
    </View>
  );
}
