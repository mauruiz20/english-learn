// Registers the web app's service worker (public sw.js, generated after `expo export -p web`)
// and tracks new versions so the UI can offer them. A new version never takes over on its
// own: it waits until the learner presses "Actualizar" (`apply`), then the page reloads once
// the new worker controls it. Platform-free and dependency-injected, so it is unit-tested with
// fakes; `app-service-worker.web.ts` wires it to the browser.

/** idle: nothing to offer · available: a new version is installed and waiting · applying: the
 * learner asked for it, the page reloads once it takes control. */
export type UpdateStatus = "idle" | "available" | "applying";

type WorkerLike = {
  readonly state: string;
  postMessage(message: unknown): void;
  addEventListener(type: "statechange", listener: () => void): void;
};

type RegistrationLike = {
  readonly installing: WorkerLike | null;
  readonly waiting: WorkerLike | null;
  update(): Promise<unknown>;
  addEventListener(type: "updatefound", listener: () => void): void;
};

export type ServiceWorkerContainerLike = {
  readonly controller: unknown;
  register(url: string, options?: RegistrationOptions): Promise<RegistrationLike>;
  addEventListener(type: "controllerchange", listener: () => void): void;
};

export type ServiceWorkerUpdates = {
  /** Registers the worker (once). Never throws: failures go to `onError`. */
  start(): Promise<void>;
  /** Asks the server whether sw.js changed (no-op before `start`). Never throws. */
  checkForUpdates(): Promise<void>;
  /** Activates the waiting version; the page reloads when it takes control. */
  apply(): void;
  subscribe(listener: () => void): () => void;
  getSnapshot(): UpdateStatus;
};

export const SKIP_WAITING_MESSAGE = { type: "SKIP_WAITING" } as const;

/** Production web builds only: not the dev server (stale bundles), not native, not http. */
export function shouldRegisterServiceWorker(env: {
  isDev: boolean;
  hasServiceWorker: boolean;
  isSecureContext: boolean;
}): boolean {
  return !env.isDev && env.hasServiceWorker && env.isSecureContext;
}

export function createServiceWorkerUpdates({
  container,
  reload,
  onError,
}: {
  container: ServiceWorkerContainerLike;
  reload: () => void;
  onError: (error: unknown) => void;
}): ServiceWorkerUpdates {
  let status: UpdateStatus = "idle";
  let registration: RegistrationLike | null = null;
  let starting: Promise<void> | null = null;
  let reloading = false;
  const listeners = new Set<() => void>();

  function setStatus(next: UpdateStatus) {
    if (next === status) return;
    status = next;
    for (const listener of listeners) listener();
  }

  /** A version is waiting; it is an update only if another version controls this page. */
  function offerWaiting() {
    if (status === "idle" && registration?.waiting && container.controller) setStatus("available");
  }

  function track(worker: WorkerLike) {
    worker.addEventListener("statechange", () => {
      if (worker.state === "installed") offerWaiting();
    });
  }

  async function register() {
    container.addEventListener("controllerchange", () => {
      // Only the learner's own "Actualizar" reloads: never mid-lesson on our own.
      if (status !== "applying" || reloading) return;
      reloading = true;
      reload();
    });
    try {
      registration = await container.register("/sw.js", { scope: "/", updateViaCache: "none" });
    } catch (error) {
      onError(error);
      return;
    }
    offerWaiting();
    if (registration.installing) track(registration.installing);
    registration.addEventListener("updatefound", () => {
      if (registration?.installing) track(registration.installing);
    });
  }

  return {
    start() {
      starting ??= register();
      return starting;
    },
    async checkForUpdates() {
      if (registration === null) return;
      try {
        await registration.update();
      } catch (error) {
        onError(error);
      }
    },
    apply() {
      const waiting = registration?.waiting;
      if (status !== "available" || !waiting) return;
      setStatus("applying");
      waiting.postMessage(SKIP_WAITING_MESSAGE);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => status,
  };
}
