import { fireEvent, render, screen } from "@testing-library/react-native";
import { cloze, passage, reading, translationChoice, vocab } from "../model/fixtures";
import { ExerciseBody } from "./exercise-body";

const onSubmit = jest.fn();
beforeEach(() => jest.clearAllMocks());

describe("ExerciseBody", () => {
  it("renders the component for the exercise type, tagged with the exercise id", async () => {
    await render(
      <ExerciseBody
        prepared={{ type: "vocab", exercise: vocab, options: vocab.options }}
        passage={undefined}
        disabled={false}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByText("What does 'wake up' mean?")).toBeOnTheScreen();
    expect(screen.getByTestId(`exercise-${vocab.id}`)).toBeOnTheScreen();
  });

  it("renders a reading exercise with its passage", async () => {
    await render(
      <ExerciseBody
        prepared={{
          type: "reading",
          exercise: reading,
          questions: reading.questions.map((q) => ({ prompt: q.prompt, options: q.options })),
        }}
        passage={passage}
        disabled={false}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByText(passage.text)).toBeOnTheScreen();
  });

  it.each([
    { type: "vocab", exercise: vocab, options: vocab.options },
    { type: "cloze", exercise: cloze, options: ["have", "do"] },
    { type: "translation_choice", exercise: translationChoice, options: translationChoice.options },
  ] as const)("uses a custom submit label for $type", async (prepared) => {
    await render(
      <ExerciseBody
        prepared={prepared}
        passage={undefined}
        disabled={false}
        submitLabel="Siguiente"
        onSubmit={onSubmit}
      />,
    );

    await fireEvent.press(screen.getByRole("radio", { name: prepared.options[0] }));
    await fireEvent.press(screen.getByRole("button", { name: "Siguiente" }));

    expect(onSubmit).toHaveBeenCalledWith({ kind: "choice", option: prepared.options[0] });
    expect(screen.queryByRole("button", { name: "Comprobar" })).not.toBeOnTheScreen();
  });
});
