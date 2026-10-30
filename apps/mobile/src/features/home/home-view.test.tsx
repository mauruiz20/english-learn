import { fireEvent, render, screen } from "@testing-library/react-native";
import { HomeView, type HomeViewState } from "./home-view";

const handlers = {
  onOpenLesson: jest.fn(),
  onStartPlacement: jest.fn(),
  onOpenReview: jest.fn(),
  onOpenAbout: jest.fn(),
};

const noLessons = { level: "A2", items: [] } as const;

const ready = {
  status: "ready",
  pendingReviews: 0,
  reviewNoteColor: "pink",
  streakDays: 0,
  xp: 0,
  level: "A2",
  lessons: noLessons,
} as const satisfies HomeViewState;

function renderView(state: HomeViewState) {
  return render(<HomeView state={state} {...handlers} />);
}

beforeEach(() => jest.clearAllMocks());

describe("HomeView", () => {
  it("shows a loading indicator", async () => {
    await renderView({ status: "loading" });

    expect(screen.getByLabelText("Cargando tu progreso")).toBeOnTheScreen();
  });

  it("shows an error message", async () => {
    await renderView({ status: "error" });

    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos cargar tu progreso.");
  });

  it("invites to take the placement test when there is no level", async () => {
    await renderView({ ...ready, level: null });

    expect(screen.getByLabelText("Racha: 0 días")).toBeOnTheScreen();
    expect(screen.getByText("0 XP")).toBeOnTheScreen();
    expect(screen.getByText("Aún no conocemos tu nivel.")).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("button", { name: "Hacer test de nivel" }));
    expect(handlers.onStartPlacement).toHaveBeenCalledTimes(1);
  });

  it("offers to retake the placement test once placed", async () => {
    await renderView({ ...ready, level: "B1" });

    await fireEvent.press(screen.getByRole("button", { name: "Repetir test de nivel" }));

    expect(handlers.onStartPlacement).toHaveBeenCalledTimes(1);
  });

  it("shows the streak, XP and level, and hides the placement CTA once placed", async () => {
    await renderView({ ...ready, streakDays: 5, xp: 120, level: "B1" });

    expect(screen.getByLabelText("Racha: 5 días")).toBeOnTheScreen();
    expect(screen.getByText("días de racha")).toBeOnTheScreen();
    expect(screen.getByText("120 XP")).toBeOnTheScreen();
    expect(screen.getByText("Tu nivel: B1")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Hacer test de nivel" })).not.toBeOnTheScreen();
  });

  it("uses the singular for a one-day streak", async () => {
    await renderView({ ...ready, streakDays: 1, xp: 10 });

    expect(screen.getByLabelText("Racha: 1 día")).toBeOnTheScreen();
    expect(screen.getByText("día de racha")).toBeOnTheScreen();
  });

  it.each([
    [3, "3 pendientes"],
    [1, "1 pendiente"],
  ])("shows a sticky note with %i pending reviews that opens the review", async (n, text) => {
    await renderView({ ...ready, pendingReviews: n });

    expect(screen.getByText("Repaso")).toBeOnTheScreen();
    expect(screen.getByText(text)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Repasar" }));
    expect(handlers.onOpenReview).toHaveBeenCalledTimes(1);
  });

  it("shows no sticky note when there is nothing to review", async () => {
    await renderView(ready);

    expect(screen.getByText("Nada para repasar hoy")).toBeOnTheScreen();
    expect(screen.queryByText("Repaso")).not.toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Repasar" })).not.toBeOnTheScreen();
  });

  it("navigates to about", async () => {
    await renderView(ready);

    await fireEvent.press(screen.getByRole("button", { name: "Acerca de" }));

    expect(handlers.onOpenAbout).toHaveBeenCalledTimes(1);
  });

  it("lists the lessons by topic with their status and the level progress, and opens one", async () => {
    await renderView({
      ...ready,
      level: null,
      lessons: {
        level: "A2",
        items: [
          {
            id: "a2.daily-routine.lesson-001",
            title: "Mi rutina diaria",
            topic: "daily-routine",
            done: true,
          },
          {
            id: "a2.daily-routine.lesson-002",
            title: "Mañanas y noches",
            topic: "daily-routine",
            done: false,
          },
          { id: "a2.food.lesson-001", title: "La comida", topic: "food", done: false },
        ],
      },
    });

    expect(screen.getByRole("header", { name: "Lecciones de nivel A2" })).toBeOnTheScreen();
    expect(screen.getByText("33 % completado")).toBeOnTheScreen();
    expect(screen.getByRole("progressbar", { name: "Progreso del nivel A2" })).toHaveProp(
      "accessibilityValue",
      { min: 0, max: 3, now: 1 },
    );
    expect(screen.getByText("Rutina diaria")).toBeOnTheScreen();
    expect(screen.getByText("Comida")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Mi rutina diaria, completada" })).toBeOnTheScreen();
    expect(screen.getByText("Completada")).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("button", { name: "La comida" }));
    expect(handlers.onOpenLesson).toHaveBeenCalledWith("a2.food.lesson-001");
  });

  it("says when there are no lessons yet", async () => {
    await renderView(ready);

    expect(screen.getByText("Todavía no hay lecciones para este nivel.")).toBeOnTheScreen();
  });
});
