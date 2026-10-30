import React from "react";
import { useLocalSearchParams } from "expo-router";
import { EarnDraftScreen } from "@/features/earn/Screens";
export default function DraftRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <EarnDraftScreen key={id} id={id} />;
}
