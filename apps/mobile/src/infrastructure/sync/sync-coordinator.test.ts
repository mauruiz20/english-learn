import { createSyncCoordinator } from "./sync-coordinator";
import type { SyncOutcome } from "./sync-engine";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const synced = (changed = false): SyncOutcome => ({
  kind: "synced",
  changed,
  uploaded: 0,
  downloaded: 0,
});

function setup(outcomes: (SyncOutcome | Promise<SyncOutcome>)[]) {
  const run = jest.fn(async () => (await outcomes.shift()) ?? synced());
  const onProgressChanged = jest.fn();
  const onSignedOut = jest.fn();
  const coordinator = createSyncCoordinator({
    engine: { run },
    now: () => 5_000,
    onProgressChanged,
    onSignedOut,
  });
  return { coordinator, run, onProgressChanged, onSignedOut };
}

describe("createSyncCoordinator", () => {
  it("starts idle and goes through syncing to synced(at)", async () => {
    const pending = deferred<SyncOutcome>();
    const { coordinator } = setup([pending.promise]);
    expect(coordinator.getStatus()).toEqual({ kind: "idle" });

    const done = coordinator.request();
    expect(coordinator.getStatus()).toEqual({ kind: "syncing" });
    pending.resolve(synced());
    await done;

    expect(coordinator.getStatus()).toEqual({ kind: "synced", at: 5_000 });
  });

  it.each([
    [{ kind: "offline" } as SyncOutcome, { kind: "offline" }],
    [{ kind: "error", message: "boom" } as SyncOutcome, { kind: "error", message: "boom" }],
  ])("reports %j", async (outcome, status) => {
    const { coordinator } = setup([outcome]);

    await coordinator.request();

    expect(coordinator.getStatus()).toEqual(status);
  });

  it("is single-flight: requests during a sync share it and run once more afterwards", async () => {
    const first = deferred<SyncOutcome>();
    const { coordinator, run } = setup([first.promise, synced()]);

    const a = coordinator.request();
    const b = coordinator.request();
    const c = coordinator.request();
    first.resolve(synced());
    await Promise.all([a, b, c]);

    expect(run).toHaveBeenCalledTimes(2);
  });

  it("tells the UI to reload when a sync changed progress", async () => {
    const { coordinator, onProgressChanged } = setup([synced(false), synced(true)]);

    await coordinator.request();
    expect(onProgressChanged).not.toHaveBeenCalled();
    await coordinator.request();
    expect(onProgressChanged).toHaveBeenCalledTimes(1);
  });

  it("goes back to idle and reports a session that ended", async () => {
    const { coordinator, onSignedOut } = setup([{ kind: "signed-out" }]);

    await coordinator.request();

    expect(coordinator.getStatus()).toEqual({ kind: "idle" });
    expect(onSignedOut).toHaveBeenCalled();
  });

  it("notifies subscribers and can be reset", async () => {
    const { coordinator } = setup([synced()]);
    const seen: string[] = [];
    coordinator.subscribe(() => seen.push(coordinator.getStatus().kind));

    await coordinator.request();
    coordinator.reset();

    expect(seen).toEqual(["syncing", "synced", "idle"]);
  });
});
