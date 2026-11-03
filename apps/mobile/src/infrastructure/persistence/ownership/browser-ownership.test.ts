import { createBrowserOwnership, letGoOfOwnerLock } from "./browser-ownership";

type Navigator = { locks?: unknown };
type Host = { navigator?: Navigator | undefined; BroadcastChannel?: unknown };

describe("the owner Web Lock", () => {
  const host = globalThis as unknown as Host;
  const original = { navigator: host.navigator, BroadcastChannel: host.BroadcastChannel };
  beforeEach(() => {
    // Node's BroadcastChannel would keep Jest running; the lock is what this test is about.
    host.BroadcastChannel = undefined;
  });
  afterEach(() => {
    host.navigator = original.navigator;
    host.BroadcastChannel = original.BroadcastChannel;
  });

  it("is held until the page lets go of it before leaving", async () => {
    let held: Promise<unknown> | null = null;
    host.navigator = {
      locks: {
        request: (_name: string, _options: unknown, callback: (lock: object) => unknown) => {
          held = Promise.resolve(callback({}));
          return held;
        },
      },
    };
    const ownership = createBrowserOwnership();

    expect((await ownership.start()).kind).toBe("owned");
    let settled = false;
    void held!.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);

    letGoOfOwnerLock();
    await held;
    expect(settled).toBe(true);
  });
});
