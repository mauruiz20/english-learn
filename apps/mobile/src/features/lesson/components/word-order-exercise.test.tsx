import { fireEvent, render, screen } from "@testing-library/react-native";
import { wordOrder } from "../model/fixtures";
import { WordOrderExercise } from "./word-order-exercise";

const onSubmit = jest.fn();
beforeEach(() => jest.clearAllMocks());

const prepared = {
  type: "word_order",
  exercise: wordOrder,
  tokens: ["wake", "I", "up", "usually"],
} as const;

async function renderExercise(disabled = false) {
  await render(<WordOrderExercise prepared={prepared} disabled={disabled} onSubmit={onSubmit} />);
}

describe("WordOrderExercise", () => {
  it("shows the Spanish sentence and the scrambled tokens", async () => {
    await renderExercise();

    expect(screen.getByText("Normalmente me despierto.")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "wake" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Comprobar" })).toBeDisabled();
  });

  it("builds the sentence by tapping tokens and returns a built token when tapped", async () => {
    await renderExercise();

    await fireEvent.press(screen.getByRole("button", { name: "I" }));
    await fireEvent.press(screen.getByRole("button", { name: "wake" }));
    expect(screen.queryByRole("button", { name: "I" })).not.toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("button", { name: "Quitar wake" }));

    expect(screen.getByRole("button", { name: "wake" })).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Quitar wake" })).not.toBeOnTheScreen();
  });

  it("submits the built tokens once every token is used", async () => {
    await renderExercise();

    for (const token of ["I", "usually", "wake"]) {
      await fireEvent.press(screen.getByRole("button", { name: token }));
    }
    expect(screen.getByRole("button", { name: "Comprobar" })).toBeDisabled();
    await fireEvent.press(screen.getByRole("button", { name: "up" }));
    await fireEvent.press(screen.getByRole("button", { name: "Comprobar" }));

    expect(onSubmit).toHaveBeenCalledWith({
      kind: "tokens",
      tokens: ["I", "usually", "wake", "up"],
    });
  });

  it("handles repeated tokens independently", async () => {
    const repeated = { ...prepared, tokens: ["the", "cat", "the", "saw", "dog"] };
    await render(<WordOrderExercise prepared={repeated} disabled={false} onSubmit={onSubmit} />);

    await fireEvent.press(screen.getAllByRole("button", { name: "the" })[0]!);

    expect(screen.getAllByRole("button", { name: "the" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Quitar the" })).toHaveLength(1);
  });

  it("locks the tokens while feedback is shown", async () => {
    await renderExercise(true);

    expect(screen.getByRole("button", { name: "wake" })).toBeDisabled();
  });
});
