import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { diffAnswer } from "@english-learn/domain";
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
        diff={diffAnswer("I usualy go to bed", "I usually go to bed.")}
        onContinue={onContinue}
      />,
    );

    expect((await struckWords()).map((w) => w.trim())).toEqual(["usualy"]);
    // The right word is written next to it, in the teacher's hand.
    expect(screen.getAllByText("usually", { includeHiddenElements: true }).length).toBeGreaterThan(
      0,
    );
  });

  it("strikes only the extra word, with the hint, in the owner's case", async () => {
    const given = "My commute to the work takes forty minutes";
    const correctAnswer = "My commute to work takes forty minutes.";
    await render(
      <AnswerFeedback
        verdict="almost"
        given={given}
        correctAnswer={correctAnswer}
        diff={diffAnswer(given, correctAnswer)}
        hint="En inglés se dice 'to work', sin 'the'."
        onContinue={onContinue}
      />,
    );

    expect((await struckWords()).map((w) => w.trim())).toEqual(["the"]);
    expect(screen.getByText("En inglés se dice 'to work', sin 'the'.")).toBeOnTheScreen();
    expect(
      screen.getByText("Casi. Fíjate: My commute to work takes forty minutes.", {
        includeHiddenElements: true,
      }),
    ).toBeTruthy();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Casi. Sobra la palabra 'the'. Respuesta correcta: My commute to work takes forty minutes.",
      { exact: true },
    );
  });

  it("marks a missing word with a caret and the word in the teacher's hand", async () => {
    await render(
      <AnswerFeedback
        verdict="almost"
        given="I listen music"
        correctAnswer="I listen to music."
        diff={diffAnswer("I listen music", "I listen to music.")}
        onContinue={onContinue}
      />,
    );

    expect(await struckWords()).toEqual([]);
    expect(screen.getAllByText("^to", { includeHiddenElements: true }).length).toBeGreaterThan(0);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Casi. Falta la palabra 'to'. Respuesta correcta: I listen to music.",
      { exact: true },
    );
  });

  it("names a changed word for screen readers", async () => {
    await render(
      <AnswerFeedback
        verdict="wrong"
        given="I live on Madrid"
        correctAnswer="I live in Madrid."
        diff={diffAnswer("I live on Madrid", "I live in Madrid.")}
        onContinue={onContinue}
      />,
    );

    expect((await struckWords()).map((w) => w.trim())).toEqual(["on"]);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Incorrecto. En lugar de 'on', va 'in'. Respuesta correcta: I live in Madrid.",
      { exact: true },
    );
  });

  it("strikes the whole answer when too little of it lines up", async () => {
    await render(
      <AnswerFeedback
        verdict="wrong"
        given="I sleep"
        correctAnswer="I usually go to bed at eleven."
        diff={diffAnswer("I sleep", "I usually go to bed at eleven.")}
        hint={undefined}
        onContinue={onContinue}
      />,
    );

    expect(await struckWords()).toEqual(["I sleep"]);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Incorrecto. Respuesta correcta: I usually go to bed at eleven.",
      { exact: true },
    );
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

  it("offers it for an almost-right answer too", async () => {
    const onDispute = jest.fn();
    await render(
      <AnswerFeedback
        verdict="almost"
        given="My commute to the work takes forty minutes"
        correctAnswer="My commute to work takes forty minutes."
        onContinue={onContinue}
        onDispute={onDispute}
      />,
    );

    await fireEvent.press(screen.getByRole("button", { name: "Mi respuesta también es correcta" }));
    expect(onDispute).toHaveBeenCalledTimes(1);
  });

  it("does not show the hint once the answer is marked as correct", async () => {
    await render(
      <AnswerFeedback
        verdict="correct"
        disputed
        given="My commute to the work takes forty minutes"
        correctAnswer="My commute to work takes forty minutes."
        hint="En inglés se dice 'to work', sin 'the'."
        onContinue={onContinue}
      />,
    );

    expect(screen.queryByText(/se dice/, { includeHiddenElements: true })).toBeNull();
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

describe("AnswerFeedback rewards", () => {
  it("pops the XP a right answer earned, as a decorative sticker", async () => {
    await render(
      <AnswerFeedback
        verdict="correct"
        given="have"
        correctAnswer="have"
        onContinue={onContinue}
      />,
    );

    expect(screen.getByText("+10", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByText("+10")).toBeNull();
  });

  it("gives half for an almost-right answer, and nothing for a wrong one", async () => {
    await render(
      <AnswerFeedback verdict="almost" given="hav" correctAnswer="have" onContinue={onContinue} />,
    );
    expect(screen.getByText("+5", { includeHiddenElements: true })).toBeTruthy();

    await render(
      <AnswerFeedback verdict="wrong" given="do" correctAnswer="have" onContinue={onContinue} />,
    );
    expect(screen.queryByText(/^\+\d+$/, { includeHiddenElements: true })).toBeNull();
  });

  it("cheers three or more right answers in a row", async () => {
    await render(
      <AnswerFeedback
        verdict="correct"
        given="have"
        correctAnswer="have"
        inARow={3}
        onContinue={onContinue}
      />,
    );

    expect(screen.getByText("¡3 seguidas!", { includeHiddenElements: true })).toBeTruthy();
  });

  it("does not cheer fewer than three", async () => {
    await render(
      <AnswerFeedback
        verdict="correct"
        given="have"
        correctAnswer="have"
        inARow={2}
        onContinue={onContinue}
      />,
    );

    expect(screen.queryByText(/seguidas/, { includeHiddenElements: true })).toBeNull();
  });
});
