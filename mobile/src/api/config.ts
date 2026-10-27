/**
 * Build-time configuration. Only EXPO_PUBLIC_* values reach the app bundle,
 * so nothing secret belongs here (see docs/ENVIRONMENT.md).
 *
 * EXPO_PUBLIC_DATA_SOURCE       'mock' (default) or 'http'
 * EXPO_PUBLIC_API_BASE_URL      DutyGraph origin, e.g. http://localhost:4317 or https://dutygraph.com
 * EXPO_PUBLIC_COMPANION_SCOPE   'questions' (default: question requests and task checks only) or 'full'
 */
export type DataSource = "mock" | "http";
export type CompanionScope = "questions" | "full";

export const config = {
  dataSource: (process.env.EXPO_PUBLIC_DATA_SOURCE === "http"
    ? "http"
    : "mock") as DataSource,
  apiBaseUrl: (
    process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:4317"
  ).replace(/\/+$/, ""),
  /** Proposed APIs are opt-in; production participant-only builds leave this unset. */
  meetingsApiBaseUrl: (
    process.env.EXPO_PUBLIC_MEETINGS_API_BASE_URL ?? ""
  ).replace(/\/+$/, ""),
  /** Pinned contract base path (contracts/companion-mobile.openapi.json). */
  mobileApiPath: "/api/mobile/v1",
  /** docs/specs/COMPANION-HANDS-FREE.md §6.1. The mock also picks its demo person from this. */
  companionScope: (process.env.EXPO_PUBLIC_COMPANION_SCOPE === "full"
    ? "full"
    : "questions") as CompanionScope,
};

export const isMock = () => config.dataSource === "mock";
