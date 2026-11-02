import { browserEnvironment } from "./ownership-environment";

describe("browserEnvironment", () => {
  it("reports an iOS Home Screen web app with every API", () => {
    expect(
      browserEnvironment({
        BroadcastChannel: function BroadcastChannel() {},
        navigator: { locks: {}, storage: { getDirectory: () => {} }, standalone: true },
      }),
    ).toEqual({ webLocks: true, broadcastChannel: true, opfs: true, displayMode: "standalone" });
  });

  it("tells a browser tab by the display-mode media query", () => {
    expect(browserEnvironment({ navigator: {}, matchMedia: () => ({ matches: false }) })).toEqual({
      webLocks: false,
      broadcastChannel: false,
      opfs: false,
      displayMode: "browser",
    });
  });

  it("knows nothing outside a browser", () => {
    expect(browserEnvironment({}).displayMode).toBe("unknown");
  });
});
