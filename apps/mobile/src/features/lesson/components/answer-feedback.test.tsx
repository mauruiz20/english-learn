import { fireEvent, render, screen } from "@testing-library/react-native";
import { AnswerFeedback } from "./answer-feedback";

const onContinue = jest.fn();

beforeEach(() => jest.clearAllMocks());

describe("AnswerFeedback", () => {
  it("announces a correct answer plainly, without repeating it", async () => {
    await render(
      <AnswerFeedback
        verdict="correct"
        given="have"
        correctAnswer="have"
        onContinue={onContinue}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Correcto", { exact: true });
    expect(screen.queryByText(/Respuesta correcta/)).not.toBeOnTheScreen();
  });

  it("announces a wrong answer with the correct one, in plain words", async () => {
    await render(
      <AnswerFeedback
        verdict="wrong"
        given="I go to park"
        correctAnswer="I went to the park."
        onContinue={onContinue}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Incorrecto. Respuesta correcta: I went to the park.",
      { exact: true },
    );
  });

  it("announces an almost-right answer with the correct one", async () => {
    await render(
      <AnswerFeedback
        verdict="almost"
        given="I usualy go to bed at eleven"
        correctAnswer="I usually go to bed at eleven."
        onContinue={onContinue}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Casi. Respuesta correcta: I usually go to bed at eleven.",
      { exact: true },
    );
  });

  it("keeps the visual marking (strike-through, margin note) away from screen readers", async () => {
    await render(
      <AnswerFeedback
        verdict="wrong"
        given="I go to park"
        correctAnswer="I went to the park."
        onContinue={onContinue}
      />,
    );

    expect(screen.queryByText("Era: I went to the park.")).not.toBeOnTheScreen();
    expect(
      screen.getByText("Era: I went to the park.", { includeHiddenElements: true }),
    ).toBeTruthy();
  });

  it("continues to the next exercise", async () => {
    await render(
      <AnswerFeedback verdict="wrong" given="do" correctAnswer="have" onContinue={onContinue} />,
    );

    await fireEvent.press(screen.getByRole("button", { name: "Continuar" }));

    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});
