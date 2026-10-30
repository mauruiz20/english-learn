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

  it("locks the options while feedback is shown", async () => {
    await render(<VocabExercise prepared={prepared} disabled onSubmit={onSubmit} />);

    expect(screen.getByRole("radio", { name: "dormirse" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Comprobar" })).toBeDisabled();
  });
});

describe("ClozeExercise", () => {
  it("shows the sentence with its blank and the Spanish hint, and submits a choice", async () => {
    const prepared = { type: "cloze", exercise: cloze, options: ["go", "have", "do"] } as const;
    await render(<ClozeExercise prepared={prepared} disabled={false} onSubmit={onSubmit} />);

    expect(screen.getByText("I usually ___ breakfast at seven.")).toBeOnTheScreen();
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
