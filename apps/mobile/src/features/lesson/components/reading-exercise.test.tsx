import { fireEvent, render, screen } from "@testing-library/react-native";
import { passage, reading } from "../model/fixtures";
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
