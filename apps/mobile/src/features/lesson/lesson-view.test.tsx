import { fireEvent, render, screen } from "@testing-library/react-native";
import { passage, reading, vocab } from "./model/fixtures";
import { LessonView, type LessonViewState } from "./lesson-view";

const handlers = {
  onSubmit: jest.fn(),
  onContinue: jest.fn(),
  onGoHome: jest.fn(),
  onRetrySave: jest.fn(),
};
beforeEach(() => jest.clearAllMocks());

async function renderView(state: LessonViewState) {
  await render(<LessonView state={state} {...handlers} />);
}

const exerciseState = {
  status: "exercise",
  title: "Mi rutina",
  position: 1,
  total: 6,
  prepared: { type: "vocab", exercise: vocab, options: vocab.options },
  passage: undefined,
  feedback: null,
} as const satisfies LessonViewState;

describe("LessonView", () => {
  it("shows the lesson title, progress and the current exercise", async () => {
    await renderView(exerciseState);

    expect(screen.getByText("Mi rutina")).toBeOnTheScreen();
    expect(screen.getByText("Ejercicio 1 de 6")).toBeOnTheScreen();
    expect(screen.getByText("What does 'wake up' mean?")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Continuar" })).not.toBeOnTheScreen();
  });

  it("submits the learner's answer", async () => {
    await renderView(exerciseState);

    await fireEvent.press(screen.getByRole("radio", { name: "despertarse" }));
    await fireEvent.press(screen.getByRole("button", { name: "Comprobar" }));

    expect(handlers.onSubmit).toHaveBeenCalledWith({ kind: "choice", option: "despertarse" });
  });

  it("shows feedback below the locked exercise and continues", async () => {
    await renderView({
      ...exerciseState,
      feedback: { verdict: "wrong", correctAnswer: "despertarse", given: "dormirse" },
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Incorrecto. Respuesta correcta: despertarse",
    );
    expect(screen.getByRole("radio", { name: "dormirse" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "despertarse, respuesta correcta" })).toBeDisabled();

    await fireEvent.press(screen.getByRole("button", { name: "Continuar" }));
    expect(handlers.onContinue).toHaveBeenCalledTimes(1);
  });

  it("renders a reading exercise with its passage", async () => {
    await renderView({
      ...exerciseState,
      prepared: { type: "reading", exercise: reading, questions: reading.questions },
      passage,
    });

    expect(screen.getByText(passage.text)).toBeOnTheScreen();
  });

  it("shows a saving indicator", async () => {
    await renderView({ status: "saving" });

    expect(screen.getByLabelText("Guardando tu progreso")).toBeOnTheScreen();
  });

  it("shows the summary and goes home", async () => {
    await renderView({ status: "summary", correct: 5, total: 6, xpEarned: 70, streakDays: 1 });

    expect(screen.getByText("¡Lección completada!")).toBeOnTheScreen();
    expect(screen.getByText("Aciertos: 5 de 6")).toBeOnTheScreen();
    expect(screen.getByText("XP ganada: 70")).toBeOnTheScreen();
    expect(screen.getByText("Racha: 1 día")).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("button", { name: "Volver al inicio" }));
    expect(handlers.onGoHome).toHaveBeenCalledTimes(1);
  });

  it("uses the plural for longer streaks", async () => {
    await renderView({ status: "summary", correct: 6, total: 6, xpEarned: 80, streakDays: 3 });

    expect(screen.getByText("Racha: 3 días")).toBeOnTheScreen();
  });

  it.each([
    [{ status: "not-found" } as const, "No encontramos esta lección."],
    [{ status: "save-error" } as const, "No pudimos guardar tu progreso."],
  ])("explains %o and offers a way home", async (state, message) => {
    await renderView(state);

    expect(screen.getByRole("alert")).toHaveTextContent(message);
    await fireEvent.press(screen.getByRole("button", { name: "Volver al inicio" }));
    expect(handlers.onGoHome).toHaveBeenCalledTimes(1);
  });

  it("offers to retry a failed save", async () => {
    await renderView({ status: "save-error" });

    await fireEvent.press(screen.getByRole("button", { name: "Reintentar" }));

    expect(handlers.onRetrySave).toHaveBeenCalledTimes(1);
  });
});
