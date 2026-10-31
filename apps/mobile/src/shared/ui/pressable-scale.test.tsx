import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { withMotion } from "@/testing/motion";
import { Button } from "./button";
import { ChoiceRow } from "./choice-row";

const onPress = jest.fn();
beforeEach(() => jest.clearAllMocks());

function scaleOf(node: { parent: unknown }) {
  // The press feedback scales the wrapper around the pressable.
  const wrapper = (node as unknown as { parent: { props: { style: unknown } } }).parent;
  const transform = StyleSheet.flatten(wrapper.props.style as never)?.transform as
    { scale?: number }[] | undefined;
  return transform?.find((t) => t.scale !== undefined)?.scale ?? 1;
}

describe("press feedback", () => {
  it("keeps a button's role, name and disabled state", async () => {
    await render(<Button label="Comprobar" onPress={onPress} disabled />);

    expect(screen.getByRole("button", { name: "Comprobar" })).toBeDisabled();
  });

  it("still presses a button once", async () => {
    withMotion();
    await render(<Button label="Continuar" onPress={onPress} />);

    await fireEvent.press(screen.getByRole("button", { name: "Continuar" }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("keeps a choice row a checkable radio", async () => {
    withMotion();
    await render(<ChoiceRow label="have" checked disabled={false} onPress={onPress} />);

    const radio = screen.getByRole("radio", { name: "have" });
    expect(radio).toBeChecked();
    await fireEvent.press(radio);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("does not move with reduced motion", async () => {
    await render(<Button label="Continuar" onPress={onPress} />);

    await fireEvent(screen.getByRole("button", { name: "Continuar" }), "pressIn");

    expect(scaleOf(screen.getByRole("button", { name: "Continuar" }))).toBe(1);
  });
});
