import { fireEvent, render, screen } from "@testing-library/react-native";
import { NotebookHeader } from "./notebook-header";

describe("NotebookHeader", () => {
  it("shows the screen title as a header and goes back to the previous screen", async () => {
    const onBack = jest.fn();
    await render(<NotebookHeader title="Lección" backTitle="Inicio" showBack onBack={onBack} />);

    expect(screen.getByRole("header", { name: "Lección" })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Volver a Inicio" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("hides the back button when going back is not allowed (e.g. while saving)", async () => {
    await render(
      <NotebookHeader title="Lección" backTitle="Inicio" showBack={false} onBack={jest.fn()} />,
    );

    expect(screen.getByRole("header", { name: "Lección" })).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: /Volver/ })).not.toBeOnTheScreen();
  });
});
