import { act } from "@testing-library/react-native";

type PreventRemoveCallback = (options: {
  data: { action: { type: string } };
  repeat: () => void;
}) => void;

/**
 * Test double for expo-router's `usePreventRemove`. Use it from a `jest.mock("expo-router")`
 * factory: `usePreventRemove: (...args) => mockPreventRemove.hook(...args)`.
 */
export function createPreventRemoveMock() {
  let active = false;
  let callback: PreventRemoveCallback | undefined;
  return {
    hook(preventRemove: boolean, onPrevent?: PreventRemoveCallback) {
      active = preventRemove;
      callback = onPrevent;
      return () => {};
    },
    /** Whether leaving the screen (back button, gesture, browser back) is currently blocked. */
    get active() {
      return active;
    },
    /**
     * Simulates the learner going back while removal is blocked, like the navigator does.
     * Returns the `repeat` function the screen calls to really leave.
     */
    async attemptLeave(): Promise<jest.Mock> {
      if (!active || callback === undefined) throw new Error("Leaving is not blocked");
      const repeat = jest.fn();
      const blocked = callback;
      await act(() => blocked({ data: { action: { type: "GO_BACK" } }, repeat }));
      return repeat;
    },
  };
}
