import { BACKGROUND_RETRY_INTERVAL_MS, startBackgroundRetry } from "./background-retry";

function fakeWeb(visibility: "visible" | "hidden" = "visible") {
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { visibilityState: visibility });
  return { win, doc };
}

describe("startBackgroundRetry", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it.each(["pageshow", "focus"])("retries when the page comes back (%s)", (type) => {
    const { win, doc } = fakeWeb();
    const retry = jest.fn();
    startBackgroundRetry({ retry, page: { win, doc } });

    win.dispatchEvent(new Event(type));

    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("retries when the page becomes visible, not when it is hidden", () => {
    const { win, doc } = fakeWeb("hidden");
    const retry = jest.fn();
    startBackgroundRetry({ retry, page: { win, doc } });

    doc.dispatchEvent(new Event("visibilitychange"));
    expect(retry).not.toHaveBeenCalled();

    doc.visibilityState = "visible";
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("retries on an interval while the page is visible", () => {
    const { win, doc } = fakeWeb("hidden");
    const retry = jest.fn();
    startBackgroundRetry({ retry, page: { win, doc } });

    jest.advanceTimersByTime(BACKGROUND_RETRY_INTERVAL_MS);
    expect(retry).not.toHaveBeenCalled();

    doc.visibilityState = "visible";
    jest.advanceTimersByTime(BACKGROUND_RETRY_INTERVAL_MS);
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("retries once (the page reloads) however many signals arrive", () => {
    const { win, doc } = fakeWeb();
    const retry = jest.fn();
    startBackgroundRetry({ retry, page: { win, doc } });

    win.dispatchEvent(new Event("pageshow"));
    win.dispatchEvent(new Event("focus"));
    jest.advanceTimersByTime(BACKGROUND_RETRY_INTERVAL_MS * 3);

    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("stops listening when the screen goes away", () => {
    const { win, doc } = fakeWeb();
    const retry = jest.fn();
    const stop = startBackgroundRetry({ retry, page: { win, doc } });

    stop();
    win.dispatchEvent(new Event("pageshow"));
    doc.dispatchEvent(new Event("visibilitychange"));
    jest.advanceTimersByTime(BACKGROUND_RETRY_INTERVAL_MS * 2);

    expect(retry).not.toHaveBeenCalled();
  });

  it("without a browser page (native, tests) it still retries on the interval", () => {
    const retry = jest.fn();
    startBackgroundRetry({ retry, page: null });

    jest.advanceTimersByTime(BACKGROUND_RETRY_INTERVAL_MS);

    expect(retry).toHaveBeenCalledTimes(1);
  });
});
