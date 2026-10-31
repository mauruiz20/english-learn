import { fireEvent, render, screen } from "@testing-library/react-native";
import { vocab } from "@/features/lesson/model/fixtures";
import { ReviewView, type ReviewViewState } from "./review-view";

const handlers = {
  onSubmit: jest.fn(),
  onContinue: jest.fn(),
  onGoHome: jest.fn(),
  onRetrySave: jest.fn(),
  onDispute: jest.fn(),
};
beforeEach(() => jest.clearAllMocks());

async function renderView(state: ReviewViewState) {
  await render(<ReviewView state={state} {...handlers} />);
}

describe("ReviewView", () => {
  it("shows a loading indicator", async () => {
    await renderView({ status: "loading" });

    expect(screen.getByLabelText("Cargando tu repaso")).toBeOnTheScreen();
  });

  it("says when there is nothing to review", async () => {
    await renderView({ status: "empty" });

    expect(screen.getByText("Nada para repasar hoy")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Volver al inicio" }));
    expect(handlers.onGoHome).toHaveBeenCalledTimes(1);
  });

  it("shows the progress, the exercise and its feedback", async () => {
    await renderView({
      status: "exercise",
      topic: undefined,
      position: 2,
      total: 5,
      prepared: { type: "vocab", exercise: vocab, options: vocab.options },
      feedback: {
        verdict: "wrong",
        correctAnswer: "despertarse",
        given: "dormirse",
        disputable: false,
      },
    });

    expect(screen.getByText("Ejercicio 2 de 5")).toBeOnTheScreen();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Incorrecto. Respuesta correcta: despertarse",
    );
    expect(screen.getByRole("radio", { name: "despertarse, respuesta correcta" })).toBeDisabled();
    await fireEvent.press(screen.getByRole("button", { name: "Continuar" }));
    expect(handlers.onContinue).toHaveBeenCalledTimes(1);
  });

  it("summarizes the review", async () => {
    await renderView({
      status: "summary",
      correct: 3,
      total: 4,
      xpEarned: 35,
      streakDays: 2,
      toReview: [{ id: "a2.routine.wake-up", term: "wake up", es: "despertarse" }],
    });

    expect(screen.getByText("¡Repaso completado!")).toBeOnTheScreen();
    expect(screen.getByText("Aciertos: 3 de 4")).toBeOnTheScreen();
    expect(screen.getByText("XP ganada: 35")).toBeOnTheScreen();
    expect(screen.getByText("Racha: 2 días")).toBeOnTheScreen();
    expect(screen.getByRole("header", { name: "Para repasar" })).toBeOnTheScreen();
    expect(screen.getByText("wake up")).toBeOnTheScreen();
    expect(screen.getByText("despertarse")).toBeOnTheScreen();
  });

  it("explains load and save errors", async () => {
    await renderView({ status: "load-error" });
    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos cargar tu repaso.");

    await renderView({ status: "save-error" });
    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos guardar tu progreso.");
    await fireEvent.press(screen.getByRole("button", { name: "Reintentar" }));
    expect(handlers.onRetrySave).toHaveBeenCalledTimes(1);
  });
});
