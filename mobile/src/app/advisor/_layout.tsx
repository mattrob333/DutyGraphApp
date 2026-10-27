import React, { useEffect, useState } from "react";
import { AppState, Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
import { radius, useColors } from "@/theme";

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
        {identity && !pairing ? <AdvisorTabs path={path} /> : null}
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

const ADVISOR_TABS = [
  { label: "Meetings", href: "/advisor/meetings" },
  { label: "Capture", href: "/advisor/capture" },
  { label: "Me", href: "/advisor/me" },
] as const;

/** Same text tabs and accent pill as the participant BottomNav, for the advisor routes. */
function AdvisorTabs({ path }: { path: string }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: "row",
        gap: 4,
        borderTopWidth: 1,
        borderTopColor: c.line,
        backgroundColor: c.nav,
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: Math.max(insets.bottom, 12),
      }}
    >
      {ADVISOR_TABS.map((tab) => {
        const section = path.startsWith("/advisor/capture")
          ? "/advisor/capture"
          : path === "/advisor/me" || path.startsWith("/advisor/me/")
            ? "/advisor/me"
            : "/advisor/meetings";
        const focused = tab.href === section;
        return (
          <Pressable
            key={tab.href}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: focused }}
            onPress={() => router.replace(tab.href as Href)}
            style={{
              flex: 1,
              minHeight: 48,
              borderRadius: radius.button + 1,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: focused ? c.accentBg : "transparent",
            }}
          >
            <Text
              variant="buttonSecondary"
              style={{ color: focused ? c.ink : c.muted }}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
