import { fireEvent, render, screen } from "@testing-library/react-native";
import { translateWrite } from "../model/fixtures";
import { TranslateWriteExercise } from "./translate-write-exercise";

const onSubmit = jest.fn();
beforeEach(() => jest.clearAllMocks());

const prepared = { type: "translate_write", exercise: translateWrite } as const;

describe("TranslateWriteExercise", () => {
  it("shows the Spanish sentence and a raw text input", async () => {
    await render(
      <TranslateWriteExercise prepared={prepared} disabled={false} onSubmit={onSubmit} />,
    );

    expect(screen.getByText("Normalmente me voy a la cama a las once.")).toBeOnTheScreen();
    const input = screen.getByLabelText("Tu traducción en inglés");
    expect(input.props.autoCapitalize).toBe("none");
    expect(input.props.autoCorrect).toBe(false);
    expect(screen.getByRole("button", { name: "Comprobar" })).toBeDisabled();
  });

  it("submits the typed text", async () => {
    await render(
      <TranslateWriteExercise prepared={prepared} disabled={false} onSubmit={onSubmit} />,
    );

    await fireEvent.changeText(
      screen.getByLabelText("Tu traducción en inglés"),
      "I usually go to bed",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Comprobar" }));

    expect(onSubmit).toHaveBeenCalledWith({ kind: "text", text: "I usually go to bed" });
  });

  it("submits from the keyboard", async () => {
    await render(
      <TranslateWriteExercise prepared={prepared} disabled={false} onSubmit={onSubmit} />,
    );
    const input = screen.getByLabelText("Tu traducción en inglés");

    await fireEvent.changeText(input, "I sleep");
    await fireEvent(input, "submitEditing");

    expect(onSubmit).toHaveBeenCalledWith({ kind: "text", text: "I sleep" });
  });

  it("does not submit blank text and locks the input during feedback", async () => {
    const { rerender } = await render(
      <TranslateWriteExercise prepared={prepared} disabled={false} onSubmit={onSubmit} />,
    );
    await fireEvent.changeText(screen.getByLabelText("Tu traducción en inglés"), "   ");
    expect(screen.getByRole("button", { name: "Comprobar" })).toBeDisabled();

    await rerender(<TranslateWriteExercise prepared={prepared} disabled onSubmit={onSubmit} />);
    expect(screen.getByLabelText("Tu traducción en inglés").props.editable).toBe(false);
  });
});
