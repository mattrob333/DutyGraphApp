/** A backend profile is a build choice, not a runtime trust boundary. */
export type BackendProfile =
  | "mock"
  | "dev-server"
  | "dutygraph-local"
  | "dutygraph-preview"
  | "dutygraph-production";

type ProfileResolution = {
  backendProfile: BackendProfile;
  dataSource: "mock" | "http";
  apiBaseUrl: string;
  meetingsApiBaseUrl: string;
};

/**
 * The old "http" mode intentionally keeps its behavior: meeting endpoints stay
 * disabled until EXPO_PUBLIC_MEETINGS_API_BASE_URL is explicitly configured.
 */
export function resolveBackendProfile(
  raw: string | undefined,
  apiOrigin?: string,
  meetingsOrigin?: string,
): ProfileResolution {
  if (!raw || raw === "mock")
    return {
      backendProfile: "mock",
      dataSource: "mock",
      apiBaseUrl: (apiOrigin ?? "http://localhost:4317").replace(/\/+$/, ""),
      meetingsApiBaseUrl: (meetingsOrigin ?? "").replace(/\/+$/, ""),
    };

  const profile: BackendProfile =
    raw === "http" ? "dev-server" : (raw as BackendProfile);
  if (
    profile !== "dev-server" &&
    profile !== "dutygraph-local" &&
    profile !== "dutygraph-preview" &&
    profile !== "dutygraph-production"
  )
    throw new Error("Invalid EXPO_PUBLIC_DATA_SOURCE backend profile");

  const fallback =
    profile === "dutygraph-production"
      ? "https://dutygraph.com"
      : profile === "dev-server"
        ? raw === "http"
          ? "http://localhost:4317"
          : "http://localhost:4417"
        : profile === "dutygraph-local"
          ? "http://localhost:4317"
          : undefined;
  const url = apiOrigin || fallback;
  if (!url)
    throw new Error("EXPO_PUBLIC_API_BASE_URL is required for the preview backend");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("EXPO_PUBLIC_API_BASE_URL must be an HTTP(S) origin");
  }
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  )
    throw new Error("EXPO_PUBLIC_API_BASE_URL must be an HTTP(S) origin without credentials or paths");
  if (
    (profile === "dutygraph-preview" || profile === "dutygraph-production") &&
    parsed.protocol !== "https:"
  )
    throw new Error("Remote DutyGraph profiles require HTTPS");
  const origin = parsed.origin;
  // Never send participant and advisor tokens to different origins on a real
  // DutyGraph profile, even if a stale development override remains set.
  const meetingsApiBaseUrl = profile.startsWith("dutygraph-")
    ? origin
    : raw === "http"
      ? (meetingsOrigin ?? "").replace(/\/+$/, "")
      : (meetingsOrigin || origin).replace(/\/+$/, "");

  return {
    backendProfile: profile,
    dataSource: "http",
    apiBaseUrl: origin,
    meetingsApiBaseUrl,
  };
}
