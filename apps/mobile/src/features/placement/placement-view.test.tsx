import { fireEvent, render, screen } from "@testing-library/react-native";
import { prepareExercise } from "@/features/lesson/model/prepare-exercise";
import { placementBank } from "./model/fixtures";
import { placementExercise } from "./model/placement-bank";
import { PlacementView, type PlacementViewState } from "./placement-view";

const handlers = {
  onStart: jest.fn(),
  onSubmit: jest.fn(),
  onRetrySave: jest.fn(),
  onGoToLessons: jest.fn(),
};
beforeEach(() => jest.clearAllMocks());

async function renderView(state: PlacementViewState) {
  await render(<PlacementView state={state} {...handlers} />);
}

const question = placementBank(1)[0]!;

describe("PlacementView", () => {
  it("explains the test and starts it", async () => {
    await renderView({ status: "intro" });

    expect(screen.getByText(/15 a 20 preguntas/)).toBeOnTheScreen();
    expect(screen.getByText(/unos 5 minutos/)).toBeOnTheScreen();
    expect(screen.getByText(/se adapta a tus respuestas/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Empezar" }));
    expect(handlers.onStart).toHaveBeenCalledTimes(1);
  });

  it("shows the question number and submits with 'Siguiente', without feedback", async () => {
    await renderView({
      status: "question",
      number: 3,
      maxQuestions: 20,
      prepared: prepareExercise(placementExercise(question), () => 0),
    });

    expect(screen.getByText("Pregunta 3 de hasta 20")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("radio", { name: "ok" }));
    await fireEvent.press(screen.getByRole("button", { name: "Siguiente" }));
    expect(handlers.onSubmit).toHaveBeenCalledWith({ kind: "choice", option: "ok" });
    expect(screen.queryByRole("alert")).not.toBeOnTheScreen();
  });

  it("shows the estimated level and the lessons it maps to", async () => {
    await renderView({
      status: "result",
      level: "B1",
      lessonLevel: "B1",
      lessonLevels: ["A2", "B1"],
    });

    expect(screen.getByText("Tu nivel estimado: B1")).toBeOnTheScreen();
    expect(screen.getByText(/Intermedio/)).toBeOnTheScreen();
    expect(screen.getByText(/lecciones de nivel B1/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Ir a mis lecciones" }));
    expect(handlers.onGoToLessons).toHaveBeenCalledTimes(1);
  });

  it("is honest when there are no lessons for the estimated level yet", async () => {
    await renderView({
      status: "result",
      level: "C1",
      lessonLevel: "B1",
      lessonLevels: ["A2", "B1"],
    });

    expect(screen.getByText("Tu nivel estimado: C1")).toBeOnTheScreen();
    expect(
      screen.getByText(
        /Por ahora hay lecciones de nivel A2 y B1\. Te recomendamos las de nivel B1/,
      ),
    ).toBeOnTheScreen();
  });

  it("offers to retry a failed save", async () => {
    await renderView({ status: "save-error" });

    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos guardar tu resultado.");
    await fireEvent.press(screen.getByRole("button", { name: "Reintentar" }));
    expect(handlers.onRetrySave).toHaveBeenCalledTimes(1);
  });

  it("shows a saving indicator", async () => {
    await renderView({ status: "saving" });

    expect(screen.getByLabelText("Guardando tu resultado")).toBeOnTheScreen();
  });
});
