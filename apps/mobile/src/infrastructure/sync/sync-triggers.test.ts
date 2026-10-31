import { createChangeSignal, startSyncTriggers } from "./sync-triggers";

describe("startSyncTriggers", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  function setup(visible = { value: true }) {
    const request = jest.fn(async () => {});
    const target = new EventTarget();
    const localChanges = createChangeSignal();
    const stop = startSyncTriggers({
      request,
      target,
      isVisible: () => visible.value,
      localChanges,
      intervalMs: 300_000,
    });
    return { request, target, localChanges, stop, visible };
  }

  it("syncs when the connection comes back", () => {
    const { request, target } = setup();

    target.dispatchEvent(new Event("online"));

    expect(request).toHaveBeenCalledTimes(1);
  });

  it("syncs after progress is saved on this device", () => {
    const { request, localChanges } = setup();

    localChanges.emit();

    expect(request).toHaveBeenCalledTimes(1);
  });

  it("syncs every 5 minutes, only while the page is visible", () => {
    const visible = { value: true };
    const { request } = setup(visible);

    jest.advanceTimersByTime(300_000);
    expect(request).toHaveBeenCalledTimes(1);

    visible.value = false;
    jest.advanceTimersByTime(300_000);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("stops every trigger when stopped", () => {
    const { request, target, localChanges, stop } = setup();

    stop();
    target.dispatchEvent(new Event("online"));
    localChanges.emit();
    jest.advanceTimersByTime(600_000);

    expect(request).not.toHaveBeenCalled();
  });
});
