import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { passage, reading } from "../model/fixtures";
import { renderWithPronunciation } from "@/testing/render-with-pronunciation";
import { ReadingExercise } from "./reading-exercise";

const onSubmit = jest.fn();
beforeEach(() => jest.clearAllMocks());

const prepared = {
  type: "reading",
  exercise: reading,
  questions: [
    { prompt: "What time does she wake up?", options: ["At seven", "At six thirty", "At six"] },
    { prompt: "How does she go to work?", options: ["On foot", "By bus", "By car"] },
  ],
} as const;

describe("ReadingExercise", () => {
  it("offers to hear the whole passage, title first", async () => {
    const { speech } = await renderWithPronunciation(
      <ReadingExercise
        prepared={prepared}
        passage={passage}
        disabled={false}
        onSubmit={onSubmit}
      />,
    );

    await fireEvent.press(screen.getByRole("button", { name: "Escuchar el texto" }));

    expect(speech.spoken.map((s) => s.text)).toEqual([`My day. ${passage.text}`]);
  });

  it("shows the passage and every question", async () => {
    await render(
      <ReadingExercise
        prepared={prepared}
        passage={passage}
        disabled={false}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByText("My day")).toBeOnTheScreen();
    expect(screen.getByText(passage.text)).toBeOnTheScreen();
    expect(screen.getByText("1. What time does she wake up?")).toBeOnTheScreen();
    expect(screen.getByText("2. How does she go to work?")).toBeOnTheScreen();
    expect(screen.getAllByRole("radio")).toHaveLength(6);
  });

  it("submits one answer per question once all are answered", async () => {
    await render(
      <ReadingExercise
        prepared={prepared}
        passage={passage}
        disabled={false}
        onSubmit={onSubmit}
      />,
    );
    await fireEvent.press(screen.getByRole("radio", { name: "At six thirty" }));
    expect(screen.getByRole("button", { name: "Comprobar" })).toBeDisabled();
    await fireEvent.press(screen.getByRole("radio", { name: "By bus" }));
    await fireEvent.press(screen.getByRole("button", { name: "Comprobar" }));

    expect(onSubmit).toHaveBeenCalledWith({
      kind: "choices",
      options: ["At six thirty", "By bus"],
    });
  });

  it("keeps both answers when different questions are tapped before a re-render", async () => {
    await render(
      <ReadingExercise
        prepared={prepared}
        passage={passage}
        disabled={false}
        onSubmit={onSubmit}
      />,
    );
    // Two taps handled in the same React batch (fast taps): both handlers come from one render.
    // `fireEvent.press` re-renders between presses, so the host click handlers are called here.
    const clickEvent = { nativeEvent: {}, stopPropagation: () => {} };
    const first = screen.getByRole("radio", { name: "At six thirty" });
    const second = screen.getByRole("radio", { name: "By bus" });
    await act(() => {
      first.props.onClick(clickEvent);
      second.props.onClick(clickEvent);
    });
    await fireEvent.press(screen.getByRole("button", { name: "Comprobar" }));

    expect(onSubmit).toHaveBeenCalledWith({
      kind: "choices",
      options: ["At six thirty", "By bus"],
    });
  });

  it("renders questions that share a prompt without key collisions", async () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => {});
    const samePrompt = {
      ...prepared,
      questions: [
        { prompt: "Is it true?", options: ["Yes", "No"] },
        { prompt: "Is it true?", options: ["True", "False"] },
      ],
    } as const;
    await render(
      <ReadingExercise
        prepared={samePrompt}
        passage={passage}
        disabled={false}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getAllByText(/Is it true\?/)).toHaveLength(2);
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it("explains when the passage is missing instead of crashing", async () => {
    await render(
      <ReadingExercise
        prepared={prepared}
        passage={undefined}
        disabled={false}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByText("Texto no disponible.")).toBeOnTheScreen();
  });
});

describe("ReadingExercise marking", () => {
  it("marks each question on its own once checked", async () => {
    await render(
      <ReadingExercise
        prepared={prepared}
        passage={passage}
        disabled={false}
        onSubmit={onSubmit}
      />,
    );
    await fireEvent.press(screen.getByRole("radio", { name: "At six thirty" }));
    await fireEvent.press(screen.getByRole("radio", { name: "On foot" }));
    await fireEvent.press(screen.getByRole("button", { name: "Comprobar" }));
    await screen.rerender(
      <ReadingExercise prepared={prepared} passage={passage} disabled reveal onSubmit={onSubmit} />,
    );

    expect(
      screen.getByRole("radio", { name: "At six thirty, seleccionada, respuesta correcta" }),
    ).toBeChecked();
    expect(screen.getByRole("radio", { name: "On foot, seleccionada, incorrecta" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "By bus, respuesta correcta" })).toBeDisabled();
    expect(screen.getAllByText("correcta")).toHaveLength(2);
  });
});
