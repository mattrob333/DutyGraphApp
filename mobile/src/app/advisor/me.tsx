import React from "react";
import { Platform, Switch, View } from "react-native";
import { router, type Href } from "expo-router";
import { Button, Heading, Screen, Text } from "@/components/common";
import { CommandError, Notice } from "@/components/advisor/Parts";
import { useAdvisorStore } from "@/state/advisor";
import { useCommand } from "@/features/advisor/useCommand";
import { advisorSessionGeneration } from "@/storage/advisor";
export default function AdvisorMe() {
  const identity = useAdvisorStore((s) => s.identity),
    clear = useAdvisorStore((s) => s.clear),
    enabled = useAdvisorStore((s) => s.biometricEnabled),
    setBiometric = useAdvisorStore((s) => s.setBiometric),
    cmd = useCommand();
  return (
    <Screen>
      <Heading>{identity?.advisor.name ?? "Advisor"}</Heading>
      <Text color="muted">{identity?.company.name}</Text>
      <Notice>
        This device can access one company. Pair again to change companies.
      </Notice>
      {Platform.OS === "web" ? (
        <Notice>
          Device unlock is available only in the native app. This is a web
          preview.
        </Notice>
      ) : (
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            minHeight: 56,
          }}
        >
          <Text>Require device unlock</Text>
          <Switch
            accessibilityLabel="Require device unlock"
            value={enabled}
            onValueChange={(value) => {
              void setBiometric(value);
            }}
          />
        </View>
      )}
      <Button
        label="Sign out advisor"
        kind="primary"
        loading={cmd.busy}
        onPress={async () => {
          const generation = advisorSessionGeneration();
          const done = await cmd.run("advisor-logout", async (r, k) => {
            await r.logout(k);
            return true;
          });
          try {
            // HTTP logout already clears locally before awaiting revocation.
            // The mock adapter still needs local cleanup here.
            if (generation === advisorSessionGeneration()) await clear();
            if (useAdvisorStore.getState().identity) return;
            router.replace(
              (done
                ? "/advisor/pair"
                : "/advisor/pair?signedOut=local") as Href,
            );
          } catch (e) {
            cmd.setError(e);
          }
        }}
      />
      <Button
        label="Return to participant tools"
        style={{ marginTop: 12 }}
        onPress={() => router.replace("/today")}
      />
      <CommandError error={cmd.error} />
    </Screen>
  );
}
