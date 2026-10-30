import {
  createServiceWorkerUpdates,
  shouldRegisterServiceWorker,
  type ServiceWorkerContainerLike,
} from "./service-worker-updates";

type Listener = () => void;

/** Minimal EventTarget: `addEventListener` plus a `fire` helper for the tests. */
class FakeTarget {
  private listeners = new Map<string, Listener[]>();
  addEventListener(type: string, listener: Listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  fire(type: string) {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }
}

class FakeWorker extends FakeTarget {
  state = "installing";
  messages: unknown[] = [];
  postMessage(message: unknown) {
    this.messages.push(message);
  }
  becomes(state: string) {
    this.state = state;
    this.fire("statechange");
  }
}

class FakeRegistration extends FakeTarget {
  installing: FakeWorker | null = null;
  waiting: FakeWorker | null = null;
  updateCalls = 0;
  async update() {
    this.updateCalls++;
  }
  /** The browser found a new sw.js and starts installing it. */
  findUpdate() {
    const worker = new FakeWorker();
    this.installing = worker;
    this.fire("updatefound");
    return worker;
  }
}

function setup({ controlled = true, waiting = false, fails = false } = {}) {
  const registration = new FakeRegistration();
  if (waiting) registration.waiting = Object.assign(new FakeWorker(), { state: "installed" });
  const container = Object.assign(new FakeTarget(), {
    controller: controlled ? {} : null,
    registered: [] as [string, RegistrationOptions | undefined][],
    async register(url: string, options?: RegistrationOptions) {
      container.registered.push([url, options]);
      if (fails) throw new Error("SecurityError");
      return registration;
    },
  });
  const reload = jest.fn();
  const onError = jest.fn();
  const updates = createServiceWorkerUpdates({
    container: container as unknown as ServiceWorkerContainerLike,
    reload,
    onError,
  });
  return { updates, registration, container, reload, onError };
}

describe("shouldRegisterServiceWorker", () => {
  it("registers only in production builds of browsers that support it on a secure origin", () => {
    const production = { isDev: false, hasServiceWorker: true, isSecureContext: true };
    expect(shouldRegisterServiceWorker(production)).toBe(true);
    expect(shouldRegisterServiceWorker({ ...production, isDev: true })).toBe(false);
    expect(shouldRegisterServiceWorker({ ...production, hasServiceWorker: false })).toBe(false);
    expect(shouldRegisterServiceWorker({ ...production, isSecureContext: false })).toBe(false);
  });
});

describe("createServiceWorkerUpdates", () => {
  it("registers /sw.js for the whole site, bypassing the HTTP cache for update checks", async () => {
    const { updates, container } = setup();
    await updates.start();
    expect(container.registered).toEqual([["/sw.js", { scope: "/", updateViaCache: "none" }]]);
  });

  it("registers once even if started twice", async () => {
    const { updates, container } = setup();
    await Promise.all([updates.start(), updates.start()]);
    expect(container.registered).toHaveLength(1);
  });

  it("offers nothing on the first install (no previous version controls the page)", async () => {
    const { updates, registration } = setup({ controlled: false });
    await updates.start();
    registration.findUpdate().becomes("installed");
    expect(updates.getSnapshot()).toBe("idle");
  });

  it("offers the update when a new version finished installing", async () => {
    const { updates, registration } = setup();
    const listener = jest.fn();
    updates.subscribe(listener);
    await updates.start();
    const worker = registration.findUpdate();
    worker.becomes("installing");
    expect(updates.getSnapshot()).toBe("idle");

    registration.waiting = worker;
    worker.becomes("installed");

    expect(updates.getSnapshot()).toBe("available");
    expect(listener).toHaveBeenCalled();
  });

  it("offers an update that was already waiting when the page loaded", async () => {
    const { updates } = setup({ waiting: true });
    await updates.start();
    expect(updates.getSnapshot()).toBe("available");
  });

  it("activates the waiting version and reloads only when the learner asks", async () => {
    const { updates, registration, container, reload } = setup({ waiting: true });
    await updates.start();
    const waiting = registration.waiting!;

    updates.apply();

    expect(updates.getSnapshot()).toBe("applying");
    expect(waiting.messages).toEqual([{ type: "SKIP_WAITING" }]);
    expect(reload).not.toHaveBeenCalled();
    container.fire("controllerchange");
    expect(reload).toHaveBeenCalledTimes(1);
    container.fire("controllerchange");
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("never reloads on its own when the controller changes", async () => {
    // E.g. the first install claiming the page, or another tab applying the update.
    const { updates, container, reload } = setup({ waiting: true });
    await updates.start();
    container.fire("controllerchange");
    expect(reload).not.toHaveBeenCalled();
  });

  it("ignores apply when there is no update", async () => {
    const { updates } = setup();
    await updates.start();
    updates.apply();
    expect(updates.getSnapshot()).toBe("idle");
  });

  it("checks the server for a new version on demand", async () => {
    const { updates, registration } = setup();
    await updates.checkForUpdates();
    expect(registration.updateCalls).toBe(0);
    await updates.start();
    await updates.checkForUpdates();
    expect(registration.updateCalls).toBe(1);
  });

  it("reports a failed registration instead of throwing (the app keeps working online)", async () => {
    const { updates, onError } = setup({ fails: true });
    await updates.start();
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(updates.getSnapshot()).toBe("idle");
  });

  it("reports a failed update check instead of throwing (e.g. offline)", async () => {
    const { updates, registration, onError } = setup();
    await updates.start();
    registration.update = () => Promise.reject(new TypeError("Failed to fetch"));
    await updates.checkForUpdates();
    expect(onError).toHaveBeenCalledWith(expect.any(TypeError));
  });
});
