import { act, render, screen } from "@testing-library/react-native";
import { AppState, Text, type AppStateStatus } from "react-native";
import { useAppVisible } from "./use-app-visible";

function Probe() {
  return <Text>{useAppVisible() ? "visible" : "hidden"}</Text>;
}

function captureAppState(initial: AppStateStatus) {
  let notify: (status: AppStateStatus) => void = () => {};
  const remove = jest.fn();
  Object.defineProperty(AppState, "currentState", { value: initial, configurable: true });
  jest.spyOn(AppState, "addEventListener").mockImplementation((_event, handler) => {
    notify = handler;
    return { remove };
  });
  return { notify: (status: AppStateStatus) => notify(status), remove };
}

afterEach(() => jest.restoreAllMocks());

describe("useAppVisible", () => {
  it("is visible while the app is in the foreground", async () => {
    captureAppState("active");
    await render(<Probe />);

    expect(screen.getByText("visible")).toBeOnTheScreen();
  });

  it("starts hidden when the app (or the browser tab) is in the background", async () => {
    captureAppState("background");
    await render(<Probe />);

    expect(screen.getByText("hidden")).toBeOnTheScreen();
  });

  it("follows the app going to the background and coming back", async () => {
    const app = captureAppState("active");
    await render(<Probe />);

    await act(async () => app.notify("background"));
    expect(screen.getByText("hidden")).toBeOnTheScreen();

    await act(async () => app.notify("active"));
    expect(screen.getByText("visible")).toBeOnTheScreen();
  });

  it("stops listening when it unmounts", async () => {
    const app = captureAppState("active");
    const { unmount } = await render(<Probe />);

    await unmount();

    expect(app.remove).toHaveBeenCalledTimes(1);
  });
});
