import { act, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo, Text } from "react-native";
import { withMotion } from "@/testing/motion";
import { useReducedMotion } from "./use-reduced-motion";

function Probe({ log }: { log: boolean[] }) {
  const reduced = useReducedMotion();
  log.push(reduced);
  return <Text>{reduced ? "reduced" : "full"}</Text>;
}

describe("useReducedMotion", () => {
  it("knows the system setting on the very first render (no frame of motion before it)", async () => {
    const log: boolean[] = [];
    await render(<Probe log={log} />);

    expect(log[0]).toBe(true);
    expect(screen.getByText("reduced")).toBeOnTheScreen();
  });

  it("is false when the system does not ask for reduced motion", async () => {
    withMotion();
    await render(<Probe log={[]} />);

    expect(screen.getByText("full")).toBeOnTheScreen();
  });

  it("follows the setting when it changes while the app is open", async () => {
    withMotion();
    let notify: (value: boolean) => void = () => {};
    jest.spyOn(AccessibilityInfo, "addEventListener").mockImplementation((_event, handler) => {
      notify = handler as (value: boolean) => void;
      return { remove: () => {} } as ReturnType<typeof AccessibilityInfo.addEventListener>;
    });
    await render(<Probe log={[]} />);

    await act(async () => notify(true));

    expect(screen.getByText("reduced")).toBeOnTheScreen();
  });
});
