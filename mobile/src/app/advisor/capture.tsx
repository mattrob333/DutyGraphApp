import React from "react";
import { Button, Heading, Screen, Text } from "@/components/common";
import { CommandError } from "@/components/advisor/Parts";
import { useCommand } from "@/features/advisor/useCommand";
import { go } from "@/features/advisor/screens";
export default function CaptureScreen() {
  const cmd = useCommand();
  return (
    <Screen>
      <Heading>Capture a meeting now</Heading>
      <Text color="muted">
        Start with a purpose. Choose attendees before any recording begins.
      </Text>
      <Button
        label="Plan a new meeting"
        kind="primary"
        style={{ marginTop: 20 }}
        onPress={() => go("/advisor/meetings/new")}
      />
      <Button
        label="Open executive kickoff"
        style={{ marginTop: 12 }}
        onPress={() => go("/advisor/kickoff/new")}
      />
      <CommandError error={cmd.error} />
    </Screen>
  );
}
