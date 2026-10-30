/**
 * All EXPO_PUBLIC_* settings become readable app-bundle constants.
 * No provider key or server credential belongs here.
 */
import { resolveBackendProfile } from "./backendProfile";
export type { BackendProfile } from "./backendProfile";
export type DataSource = "mock" | "http";
export type CompanionScope = "questions" | "full";

const backend = resolveBackendProfile(
  process.env.EXPO_PUBLIC_DATA_SOURCE,
  process.env.EXPO_PUBLIC_API_BASE_URL,
  process.env.EXPO_PUBLIC_MEETINGS_API_BASE_URL,
);
export const config = {
  ...backend,
  facilitatorRealtime: process.env.EXPO_PUBLIC_FACILITATOR_REALTIME === "true",
  mobileApiPath: "/api/mobile/v1",
  companionScope: (process.env.EXPO_PUBLIC_COMPANION_SCOPE === "full"
    ? "full"
    : "questions") as CompanionScope,
};
export const isMock = () => config.dataSource === "mock";
