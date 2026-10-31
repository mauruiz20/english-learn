import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
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

describe("AnswerFeedback marking (reduced motion: shown at once)", () => {
  // The strike is drawn over the answer once its width is known.
  const struckWords = async () => {
    await fireEvent(
      screen.getByTestId("struck-answer", { includeHiddenElements: true }),
      "layout",
      {
        nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 31 } },
      },
    );
    return screen
      .getAllByText(/.+/, { includeHiddenElements: true })
      .filter((node) => StyleSheet.flatten(node.props.style)?.textDecorationLine === "line-through")
      .map((node) => node.props.children as string);
  };

  it("strikes the whole wrong answer through in red pen", async () => {
    await render(
      <AnswerFeedback
        verdict="wrong"
        given="I go to park"
        correctAnswer="I went to the park."
        onContinue={onContinue}
      />,
    );

    expect(await struckWords()).toEqual(["I go to park"]);
  });

  it("strikes only the words that are off when the answer is almost right", async () => {
    await render(
      <AnswerFeedback
        verdict="almost"
        given="I usualy go to bed"
        correctAnswer="I usually go to bed."
        onContinue={onContinue}
      />,
    );

    expect((await struckWords()).map((w) => w.trim())).toEqual(["usualy"]);
  });

  it("shows the margin note fully drawn, not waiting for an animation", async () => {
    await render(
      <AnswerFeedback verdict="wrong" given="do" correctAnswer="have" onContinue={onContinue} />,
    );

    const note = screen.getByTestId("margin-note");
    expect(StyleSheet.flatten(note.props.style)).toMatchObject({ opacity: 1 });
  });
});

describe("AnswerFeedback: 'Mi respuesta también es correcta'", () => {
  it("offers a quiet button to mark a wrong answer as correct", async () => {
    const onDispute = jest.fn();
    await render(
      <AnswerFeedback
        verdict="wrong"
        given="I go to sleep at eleven"
        correctAnswer="I usually go to bed at eleven."
        onContinue={onContinue}
        onDispute={onDispute}
      />,
    );

    await fireEvent.press(screen.getByRole("button", { name: "Mi respuesta también es correcta" }));
    expect(onDispute).toHaveBeenCalledTimes(1);
    expect(onContinue).not.toHaveBeenCalled();
  });

  it("does not offer it without a handler (correct answers, other exercises)", async () => {
    await render(
      <AnswerFeedback verdict="wrong" given="x" correctAnswer="y" onContinue={onContinue} />,
    );
    expect(
      screen.queryByRole("button", { name: "Mi respuesta también es correcta" }),
    ).not.toBeOnTheScreen();
  });

  it("shows a disputed answer highlighted as 'Marcada como correcta'", async () => {
    await render(
      <AnswerFeedback
        verdict="correct"
        disputed
        given="I go to sleep at eleven"
        correctAnswer="I usually go to bed at eleven."
        onContinue={onContinue}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Marcada como correcta", { exact: true });
    // Announced, and written next to the highlighted answer.
    expect(
      screen.getAllByText("Marcada como correcta", { includeHiddenElements: true }),
    ).toHaveLength(2);
    expect(
      screen.getByText("I go to sleep at eleven", { includeHiddenElements: true }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Mi respuesta también es correcta" }),
    ).not.toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeOnTheScreen();
  });
});
