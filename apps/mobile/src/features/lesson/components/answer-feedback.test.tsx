import { fireEvent, render, screen } from "@testing-library/react-native";
import { AnswerFeedback } from "./answer-feedback";

const onContinue = jest.fn();
beforeEach(() => jest.clearAllMocks());

describe("AnswerFeedback", () => {
  it("celebrates a correct answer without repeating it", async () => {
    await render(<AnswerFeedback verdict="correct" correctAnswer="have" onContinue={onContinue} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Correcto");
    expect(screen.queryByText(/Respuesta correcta/)).not.toBeOnTheScreen();
  });

  it.each([
    ["almost", "¡Casi!"],
    ["wrong", "Incorrecto"],
  ] as const)("shows %s with the correct answer", async (verdict, title) => {
    await render(
      <AnswerFeedback
        verdict={verdict}
        correctAnswer="I usually go to bed at eleven."
        onContinue={onContinue}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(title);
    expect(
      screen.getByText("Respuesta correcta: I usually go to bed at eleven."),
    ).toBeOnTheScreen();
  });

  it("continues to the next exercise", async () => {
    await render(<AnswerFeedback verdict="wrong" correctAnswer="have" onContinue={onContinue} />);

    await fireEvent.press(screen.getByRole("button", { name: "Continuar" }));

    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});
