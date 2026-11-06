import { fireEvent, screen } from "@testing-library/react-native";
import { createFakeSettingsRepository } from "@/testing/fake-settings-repository";
import { createFakeSpeech } from "@/testing/fake-speech";
import { renderWithPronunciation } from "@/testing/render-with-pronunciation";
import type { ListenExercise } from "../model/listen-exercise";
import { ListenExerciseView } from "./listen-exercise";

const onSubmit = jest.fn();
beforeEach(() => jest.clearAllMocks());

const dictation: ListenExercise = {
  type: "listen",
  mode: "write",
  id: "a2.o1~listen",
  sourceId: "a2.o1",
  itemIds: ["a2.routine.usually"],
  level: "A2",
  sentence: "I usually go to bed at eleven.",
  answers: ["I usually go to bed at eleven."],
  options: [],
};

const choice: ListenExercise = {
  ...dictation,
  mode: "choose",
  options: ["I usually go to bed at eleven.", "She goes to work by bus.", "We eat at home."],
};

describe("ListenExerciseView", () => {
  it("plays the sentence, slowly on request, and never shows it before the check", async () => {
    const { speech } = await renderWithPronunciation(
      <ListenExerciseView
        prepared={{ type: "listen", exercise: dictation, options: [] }}
        disabled={false}
        onSubmit={onSubmit}
      />,
    );
    expect(screen.getByText("Escucha y escribe")).toBeOnTheScreen();
    expect(screen.queryByText(dictation.sentence)).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "Escuchar la frase" }));
    await fireEvent.press(screen.getByRole("button", { name: "Escuchar más lento" }));

    expect(speech.spoken.map((s) => [s.text, s.rate])).toEqual([
      [dictation.sentence, 1],
      [dictation.sentence, 0.7],
    ]);
  });

  it("plays at the learner's slow speed when they picked it", async () => {
    const { speech } = await renderWithPronunciation(
      <ListenExerciseView
        prepared={{ type: "listen", exercise: dictation, options: [] }}
        disabled={false}
        onSubmit={onSubmit}
      />,
      { settings: createFakeSettingsRepository({ speechRate: "slow" }) },
    );
    await fireEvent.press(screen.getByRole("button", { name: "Escuchar la frase" }));
    expect(speech.spoken[0]?.rate).toBe(0.7);
  });

  it("sends what the learner wrote", async () => {
    await renderWithPronunciation(
      <ListenExerciseView
        prepared={{ type: "listen", exercise: dictation, options: [] }}
        disabled={false}
        onSubmit={onSubmit}
      />,
    );
    await fireEvent.changeText(
      screen.getByLabelText("Lo que escuchaste, en inglés"),
      "i usually go to bed at eleven",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Comprobar" }));
    expect(onSubmit).toHaveBeenCalledWith({ kind: "text", text: "i usually go to bed at eleven" });
  });

  it("offers the sentences to choose from and sends the pick", async () => {
    await renderWithPronunciation(
      <ListenExerciseView
        prepared={{ type: "listen", exercise: choice, options: [...choice.options].reverse() }}
        disabled={false}
        onSubmit={onSubmit}
      />,
    );
    expect(screen.getByText("Escucha y elige")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("radio", { name: "She goes to work by bus." }));
    await fireEvent.press(screen.getByRole("button", { name: "Comprobar" }));
    expect(onSubmit).toHaveBeenCalledWith({ kind: "choice", option: "She goes to work by bus." });
  });

  it("shows the sentence when it cannot be heard (pronunciation switched off meanwhile)", async () => {
    await renderWithPronunciation(
      <ListenExerciseView
        prepared={{ type: "listen", exercise: dictation, options: [] }}
        disabled={false}
        onSubmit={onSubmit}
      />,
      { speech: createFakeSpeech({ available: false }) },
    );
    expect(screen.queryByRole("button", { name: "Escuchar la frase" })).toBeNull();
    expect(screen.getByText(dictation.sentence)).toBeOnTheScreen();
  });
});
