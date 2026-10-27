import React, { useEffect, useState } from "react";
import { AppState, Platform, View } from "react-native";
import { Redirect, Slot, router, usePathname, type Href } from "expo-router";
import * as LocalAuthentication from "expo-local-authentication";
import { useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Heading,
  LoadingState,
  Screen,
  Text,
  TopBar,
} from "@/components/common";
import { useAdvisorStore } from "@/state/advisor";
import { useColors } from "@/theme";

/** Company-scoped advisor routes are inaccessible before pairing and native device unlock. */
export default function AdvisorLayout() {
  const path = usePathname(),
    c = useColors();
  const { hydrated, identity, hydrate } = useAdvisorStore();
  const queries = useQueryClient();
  const identityKey = identity
    ? `${identity.company.id}:${identity.advisor.id}`
    : null;
  const priorCompany = React.useRef(identityKey);
  useEffect(() => {
    if (priorCompany.current !== identityKey) {
      void queries.cancelQueries({ queryKey: ["advisor"] });
      queries.removeQueries({ queryKey: ["advisor"] });
      priorCompany.current = identityKey;
    }
  }, [identityKey, queries]);
  const enabled = useAdvisorStore((s) => s.biometricEnabled);
  const [unlocked, setUnlocked] = useState(Platform.OS === "web"),
    [mounted, setMounted] = useState(Platform.OS === "web"),
    [authenticating, setAuthenticating] = useState(false),
    [error, setError] = useState("");
  const [authenticatedCompany, setAuthenticatedCompany] = useState<
    string | null
  >(null);
  const unlock = async () => {
    setAuthenticating(true);
    setError("");
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Unlock DutyGraph advisor tools",
        cancelLabel: "Keep locked",
        disableDeviceFallback: false,
      });
      if (result.success) {
        setUnlocked(true);
        setMounted(true);
        setAuthenticatedCompany(identityKey);
      } else setError("Unlock this phone to open advisor tools.");
    } catch {
      setError(
        "Device authentication is unavailable. Set a screen lock, then try again.",
      );
    } finally {
      setAuthenticating(false);
    }
  };
  useEffect(() => {
    if (!hydrated) void hydrate();
  }, [hydrated]);
  useEffect(() => {
    if (identity && Platform.OS !== "web" && enabled) void unlock();
    if (!enabled) {
      setUnlocked(true);
      setMounted(true);
    }
  }, [identityKey, enabled]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") setUnlocked(Platform.OS === "web");
    });
    return () => sub.remove();
  }, []);
  if (!hydrated) return <LoadingState />;
  const pairing = path === "/advisor/pair";
  if (!pairing && !identity) return <Redirect href={"/advisor/pair" as Href} />;
  const locked =
    !pairing &&
    !!identity &&
    Platform.OS !== "web" &&
    enabled &&
    (!unlocked || authenticatedCompany !== identityKey);
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View
        style={{ flex: 1 }}
        pointerEvents={locked ? "none" : "auto"}
        accessibilityElementsHidden={locked}
        importantForAccessibility={locked ? "no-hide-descendants" : "auto"}
      >
        <TopBar
          onBack={() =>
            router.canGoBack() ? router.back() : router.replace("/today")
          }
        />
        {identity && !pairing ? (
          <View
            style={{
              borderBottomWidth: 1,
              borderBottomColor: c.line,
              paddingHorizontal: 20,
              paddingBottom: 8,
            }}
          >
            <Text variant="small" color="muted">
              {identity.company.name} · Advisor
              {Platform.OS === "web" ? " · Web preview" : ""}
            </Text>
          </View>
        ) : null}
        {pairing ||
        Platform.OS === "web" ||
        !enabled ||
        (mounted && authenticatedCompany === identityKey) ? (
          <Slot />
        ) : null}
        {identity && !pairing ? (
          <View
            accessibilityRole="tablist"
            style={{
              flexDirection: "row",
              gap: 8,
              borderTopWidth: 1,
              borderTopColor: c.line,
              backgroundColor: c.nav,
              paddingHorizontal: 16,
              paddingVertical: 10,
            }}
          >
            <Button
              label="Meetings"
              style={{ flex: 1 }}
              onPress={() => router.replace("/advisor/meetings" as Href)}
            />
            <Button
              label="Capture"
              style={{ flex: 1 }}
              onPress={() => router.replace("/advisor/capture" as Href)}
            />
            <Button
              label="Me"
              style={{ flex: 1 }}
              onPress={() => router.replace("/advisor/me" as Href)}
            />
          </View>
        ) : null}
      </View>
      {locked ? (
        <View
          accessibilityViewIsModal
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: c.bg,
          }}
        >
          <Screen>
            <Heading>Advisor tools are locked</Heading>
            <Text color="muted">
              Unlock this phone to continue in {identity.company.name}.
            </Text>
            {error ? (
              <Text color="amber" style={{ marginVertical: 16 }}>
                {error}
              </Text>
            ) : null}
            <Button
              label="Unlock advisor tools"
              kind="primary"
              loading={authenticating}
              onPress={unlock}
            />
          </Screen>
        </View>
      ) : null}
    </View>
  );
}
