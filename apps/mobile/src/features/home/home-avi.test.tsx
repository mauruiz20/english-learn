import { act, render, screen } from "@testing-library/react-native";
import { AppState, StyleSheet, type AppStateStatus } from "react-native";
import { withMotion } from "@/testing/motion";
import { BLINK_EVERY_MS, HomeAvi } from "./home-avi";
import type { HomeAviState } from "./model/home-avi";

const HIDDEN = { includeHiddenElements: true } as const;

const idle: HomeAviState = { kind: "idle", mood: "happy", bubble: null, moment: null };
const missed: HomeAviState = {
  kind: "missed-you",
  mood: "sad",
  bubble: "Te extrañé. Hoy empezamos una racha nueva.",
  moment: "droop",
};

function renderAvi(state: HomeAviState, props: { active?: boolean } = {}) {
  return render(<HomeAvi state={state} active={props.active ?? true} />);
}

function appState(initial: AppStateStatus) {
  let notify: (status: AppStateStatus) => void = () => {};
  Object.defineProperty(AppState, "currentState", { value: initial, configurable: true });
  jest.spyOn(AppState, "addEventListener").mockImplementation((_event, handler) => {
    notify = handler;
    return { remove: () => {} };
  });
  return (status: AppStateStatus) => notify(status);
}

const blinking = () => screen.queryByTestId("avi-eyes-closed", HIDDEN) !== null;

/** Lets the blink timer run once. */
async function waitOneBlink() {
  await act(async () => {
    jest.advanceTimersByTime(BLINK_EVERY_MS + 10);
  });
}

beforeEach(() => appState("active"));
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("HomeAvi", () => {
  it("is decorative: no button, hidden from screen readers", async () => {
    await renderAvi(missed);

    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByTestId("avi-hero")).toBeNull();
    expect(screen.getByTestId("avi-hero", HIDDEN)).toBeTruthy();
    // The bubble still carries the state for everyone.
    expect(screen.getByText("Te extrañé. Hoy empezamos una racha nueva.")).toBeOnTheScreen();
  });

  it("says its line in a speech bubble, announced politely", async () => {
    await renderAvi(missed);

    const bubble = screen.getByText("Te extrañé. Hoy empezamos una racha nueva.");
    expect(bubble).toHaveProp("accessibilityLiveRegion", "polite");
  });

  it("has no bubble with nothing to say", async () => {
    await renderAvi(idle);

    expect(screen.queryByTestId("home-avi-bubble")).toBeNull();
  });

  it("wears the state's mood", async () => {
    await renderAvi(missed);

    expect(screen.getByTestId("avi-eyes-sad", HIDDEN)).toBeTruthy();
  });

  describe("with reduced motion", () => {
    it("shows the droop's final pose at once", async () => {
      await renderAvi(missed);

      expect(StyleSheet.flatten(screen.getByTestId("home-avi-pose").props.style)).toMatchObject({
        transform: expect.arrayContaining([{ rotate: "12deg" }, { translateY: 4 }]),
      });
    });

    it("never blinks", async () => {
      jest.useFakeTimers();
      await renderAvi(idle);

      await waitOneBlink();

      expect(blinking()).toBe(false);
    });
  });

  describe("with motion", () => {
    beforeEach(() => withMotion());

    it("blinks now and then while it is on screen", async () => {
      jest.useFakeTimers();
      await renderAvi(idle);

      await waitOneBlink();

      expect(blinking()).toBe(true);
    });

    it("does not blink while home is not the focused screen", async () => {
      jest.useFakeTimers();
      await renderAvi(idle, { active: false });

      await waitOneBlink();

      expect(blinking()).toBe(false);
    });

    it("pauses while the app or tab is hidden, and goes on when it is back", async () => {
      jest.useFakeTimers();
      const notify = appState("active");
      await renderAvi(idle);

      await act(async () => notify("background"));
      await waitOneBlink();
      expect(blinking()).toBe(false);

      await act(async () => notify("active"));
      await waitOneBlink();
      expect(blinking()).toBe(true);
    });
  });
});
