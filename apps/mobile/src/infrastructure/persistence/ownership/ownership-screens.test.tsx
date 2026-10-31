import { fireEvent, render, screen } from "@testing-library/react-native";
import { OpenElsewhereScreen, ReleasedScreen } from "./ownership-screens";

describe("tab ownership screens", () => {
  it("explains the app is open in another tab or window and offers to use it here", async () => {
    const onUseHere = jest.fn();
    await render(<OpenElsewhereScreen onUseHere={onUseHere} />);

    expect(screen.getByRole("header")).toHaveTextContent(
      "La app está abierta en otra pestaña o ventana",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Usar aquí" }));
    expect(onUseHere).toHaveBeenCalledTimes(1);
  });

  it("tells the released tab the app moved, and lets it take the app back", async () => {
    const onUseHere = jest.fn();
    await render(<ReleasedScreen onUseHere={onUseHere} />);

    expect(screen.getByRole("header")).toHaveTextContent("La app se abrió en otra pestaña");
    await fireEvent.press(screen.getByRole("button", { name: "Usar aquí" }));
    expect(onUseHere).toHaveBeenCalledTimes(1);
  });
});
