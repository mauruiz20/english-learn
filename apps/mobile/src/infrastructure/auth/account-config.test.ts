import { accountAvailability, resolveApiBaseUrl } from "./account-config";

describe("accountAvailability", () => {
  it("offers accounts on the app's own site", () => {
    expect(accountAvailability("web", "https://english.maumar.com.ar")).toBe("available");
  });

  it.each(["http://localhost:8081", "http://localhost:4173", "http://127.0.0.1:8081"])(
    "offers accounts on a local development server (%s)",
    (origin) => {
      expect(accountAvailability("web", origin)).toBe("available");
    },
  );

  it.each([
    "https://english-learn-iwl.pages.dev",
    "https://preview.english-learn-iwl.pages.dev",
    "https://english.maumar.com.ar.evil.example",
    "http://english.maumar.com.ar",
  ])("does not offer accounts on another site, where the session cookie cannot work (%s)", (o) => {
    expect(accountAvailability("web", o)).toBe("wrong-origin");
  });

  it.each(["android", "ios"] as const)("is not available yet in the %s app", (platform) => {
    expect(accountAvailability(platform, null)).toBe("native");
  });
});

describe("resolveApiBaseUrl", () => {
  it("uses the configured URL", () => {
    expect(resolveApiBaseUrl("http://api.test:9000", false)).toBe("http://api.test:9000");
  });

  it("defaults to the production API in production builds", () => {
    expect(resolveApiBaseUrl(undefined, false)).toBe("https://english-api.maumar.com.ar");
  });

  it("defaults to the local API in development", () => {
    expect(resolveApiBaseUrl("", true)).toBe("http://localhost:8000");
  });
});
