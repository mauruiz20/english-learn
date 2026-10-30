import { fireEvent, render, screen } from "@testing-library/react-native";
import { cloze, translationChoice, vocab } from "../model/fixtures";
import { ClozeExercise } from "./cloze-exercise";
import { TranslationChoiceExercise } from "./translation-choice-exercise";
import { VocabExercise } from "./vocab-exercise";

const onSubmit = jest.fn();
beforeEach(() => jest.clearAllMocks());

describe("VocabExercise", () => {
  const prepared = {
    type: "vocab",
    exercise: vocab,
    options: ["acostarse", "despertarse", "dormirse"],
  } as const;

  it("shows the prompt and the options in the prepared order", async () => {
    await render(<VocabExercise prepared={prepared} disabled={false} onSubmit={onSubmit} />);

    expect(screen.getByText("What does 'wake up' mean?")).toBeOnTheScreen();
    expect(screen.getAllByRole("radio").map((r) => r.props.accessibilityLabel)).toEqual(
      prepared.options,
    );
  });

  it("submits the selected option once the learner checks", async () => {
    await render(<VocabExercise prepared={prepared} disabled={false} onSubmit={onSubmit} />);
    const check = screen.getByRole("button", { name: "Comprobar" });
    expect(check).toBeDisabled();

    await fireEvent.press(screen.getByRole("radio", { name: "dormirse" }));
    await fireEvent.press(screen.getByRole("radio", { name: "despertarse" }));

    expect(screen.getByRole("radio", { name: "despertarse" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "dormirse" })).not.toBeChecked();
    await fireEvent.press(check);
    expect(onSubmit).toHaveBeenCalledWith({ kind: "choice", option: "despertarse" });
  });

  it("locks the options and drops the check button while feedback is shown", async () => {
    await render(<VocabExercise prepared={prepared} disabled onSubmit={onSubmit} />);

    expect(screen.getByRole("radio", { name: "dormirse" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Comprobar" })).not.toBeOnTheScreen();
  });
});

describe("ClozeExercise", () => {
  it("shows the sentence with its blank and the Spanish hint, and submits a choice", async () => {
    const prepared = { type: "cloze", exercise: cloze, options: ["go", "have", "do"] } as const;
    await render(<ClozeExercise prepared={prepared} disabled={false} onSubmit={onSubmit} />);

    expect(screen.getByLabelText("I usually ___ breakfast at seven.")).toBeOnTheScreen();
    expect(screen.getByText("Normalmente desayuno a las siete.")).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("radio", { name: "have" }));
    await fireEvent.press(screen.getByRole("button", { name: "Comprobar" }));

    expect(onSubmit).toHaveBeenCalledWith({ kind: "choice", option: "have" });
  });
});

describe("TranslationChoiceExercise", () => {
  it("shows the English sentence and submits a Spanish option", async () => {
    const prepared = {
      type: "translation_choice",
      exercise: translationChoice,
      options: translationChoice.options,
    } as const;
    await render(
      <TranslationChoiceExercise prepared={prepared} disabled={false} onSubmit={onSubmit} />,
    );

    expect(screen.getByText("She goes to bed at eleven.")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("radio", { name: "Ella se acuesta a las once." }));
    await fireEvent.press(screen.getByRole("button", { name: "Comprobar" }));

    expect(onSubmit).toHaveBeenCalledWith({
      kind: "choice",
      option: "Ella se acuesta a las once.",
    });
  });
});

describe("the teacher's marking once the answer is checked", () => {
  const vocabPrepared = {
    type: "vocab",
    exercise: vocab,
    options: ["acostarse", "despertarse", "dormirse"],
  } as const;

  /** Picks `option`, checks it, then shows the feedback (the exercise locks and reveals). */
  async function answerVocab(option: string) {
    await render(<VocabExercise prepared={vocabPrepared} disabled={false} onSubmit={onSubmit} />);
    await fireEvent.press(screen.getByRole("radio", { name: option }));
    await fireEvent.press(screen.getByRole("button", { name: "Comprobar" }));
    await screen.rerender(
      <VocabExercise prepared={vocabPrepared} disabled reveal onSubmit={onSubmit} />,
    );
  }

  it("marks a wrong choice as the learner's mistake and points out the right one", async () => {
    await answerVocab("dormirse");

    const mistake = screen.getByRole("radio", { name: "dormirse, seleccionada, incorrecta" });
    expect(mistake).toBeChecked();
    const right = screen.getByRole("radio", { name: "despertarse, respuesta correcta" });
    expect(right).not.toBeChecked();
    // The right answer is labelled in words, not only by its color.
    expect(screen.getByText("correcta")).toBeOnTheScreen();
    expect(screen.getByRole("radio", { name: "acostarse" })).toBeOnTheScreen();
  });

  it("marks a right choice as correct and nothing as wrong", async () => {
    await answerVocab("despertarse");

    expect(
      screen.getByRole("radio", { name: "despertarse, seleccionada, respuesta correcta" }),
    ).toBeChecked();
    expect(screen.queryByRole("radio", { name: /incorrecta/ })).not.toBeOnTheScreen();
    expect(screen.getByText("correcta")).toBeOnTheScreen();
  });

  it("makes every option non-interactive while the feedback is shown", async () => {
    await answerVocab("dormirse");

    for (const option of screen.getAllByRole("radio")) expect(option).toBeDisabled();
    await fireEvent.press(screen.getByRole("radio", { name: "acostarse" }));
    expect(screen.getByRole("radio", { name: "acostarse" })).not.toBeChecked();
  });

  it("does not reveal anything when the exercise is only locked (placement)", async () => {
    await render(<VocabExercise prepared={vocabPrepared} disabled onSubmit={onSubmit} />);

    expect(screen.queryByText("correcta")).not.toBeOnTheScreen();
    expect(screen.getByRole("radio", { name: "despertarse" })).toBeOnTheScreen();
  });

  it("marks a cloze blank: any accepted answer on offer is the right one", async () => {
    const prepared = { type: "cloze", exercise: cloze, options: ["go", "have", "do"] } as const;
    await render(<ClozeExercise prepared={prepared} disabled={false} onSubmit={onSubmit} />);
    await fireEvent.press(screen.getByRole("radio", { name: "do" }));
    await fireEvent.press(screen.getByRole("button", { name: "Comprobar" }));
    await screen.rerender(
      <ClozeExercise prepared={prepared} disabled reveal onSubmit={onSubmit} />,
    );

    expect(screen.getByRole("radio", { name: "do, seleccionada, incorrecta" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "have, respuesta correcta" })).toBeOnTheScreen();
    expect(screen.getByRole("radio", { name: "go" })).toBeOnTheScreen();
  });

  it("marks a translation choice", async () => {
    const prepared = {
      type: "translation_choice",
      exercise: translationChoice,
      options: translationChoice.options,
    } as const;
    await render(
      <TranslationChoiceExercise prepared={prepared} disabled={false} onSubmit={onSubmit} />,
    );
    await fireEvent.press(screen.getByRole("radio", { name: "Ella come a las once." }));
    await fireEvent.press(screen.getByRole("button", { name: "Comprobar" }));
    await screen.rerender(
      <TranslationChoiceExercise prepared={prepared} disabled reveal onSubmit={onSubmit} />,
    );

    expect(
      screen.getByRole("radio", { name: "Ella come a las once., seleccionada, incorrecta" }),
    ).toBeChecked();
    expect(
      screen.getByRole("radio", { name: "Ella se acuesta a las once., respuesta correcta" }),
    ).toBeOnTheScreen();
  });
});
