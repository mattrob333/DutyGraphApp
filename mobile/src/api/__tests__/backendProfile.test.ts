import { describe, expect, test } from "@jest/globals";
import { resolveBackendProfile } from "../backendProfile";

describe("backend profiles", () => {
  test("mock is the safe default", () => {
    const profile = resolveBackendProfile(undefined);
    expect(profile.backendProfile).toBe("mock");
    expect(profile.dataSource).toBe("mock");
    expect(profile.meetingsApiBaseUrl).toBe("");
  });
  test("legacy http keeps meeting API opt-in", () => {
    expect(resolveBackendProfile("http", "http://localhost:4417")).toMatchObject({
      dataSource: "http",
      apiBaseUrl: "http://localhost:4417",
      meetingsApiBaseUrl: "",
    });
  });
  test("explicit dev-server enables the single local origin", () => {
    expect(resolveBackendProfile("dev-server")).toMatchObject({
      apiBaseUrl: "http://localhost:4417",
      meetingsApiBaseUrl: "http://localhost:4417",
    });
  });
  test("local real DutyGraph uses a single URL regardless of dev overrides", () => {
    const profile = resolveBackendProfile(
      "dutygraph-local",
      "http://192.0.2.12:4317/",
      "https://untrusted.example",
    );
    expect(profile.apiBaseUrl).toBe("http://192.0.2.12:4317");
    expect(profile.meetingsApiBaseUrl).toBe(profile.apiBaseUrl);
  });
  test("preview requires an explicit HTTPS origin", () => {
    expect(() => resolveBackendProfile("dutygraph-preview")).toThrow();
    expect(() =>
      resolveBackendProfile("dutygraph-preview", "http://preview.example.com"),
    ).toThrow("HTTPS");
    const profile = resolveBackendProfile(
      "dutygraph-preview",
      "https://preview.example.com/",
    );
    expect(profile.meetingsApiBaseUrl).toBe("https://preview.example.com");
  });
  test("production defaults to the real origin", () => {
    const profile = resolveBackendProfile("dutygraph-production");
    expect(profile.apiBaseUrl).toBe("https://dutygraph.com");
    expect(profile.meetingsApiBaseUrl).toBe(profile.apiBaseUrl);
  });
  test.each([
    "file:///secret",
    "https://user:password@host.example",
    "https://host.example/a/path",
    "https://host.example/#fragment",
    "https://host.example/?token=secret",
  ])("rejects unsafe origins: %s", (input) => {
    expect(() => resolveBackendProfile("dutygraph-preview", input)).toThrow();
  });
  test("rejects unknown profiles instead of silently connecting to mock data", () => {
    expect(() => resolveBackendProfile("dutygraph-productoin")).toThrow();
  });
});
