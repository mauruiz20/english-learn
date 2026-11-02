import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { withMotion } from "@/testing/motion";
import { HomeView, type HomeViewState } from "./home-view";

const handlers = {
  onOpenLesson: jest.fn(),
  onStartPlacement: jest.fn(),
  onOpenReview: jest.fn(),
  onOpenAbout: jest.fn(),
  onToggleSound: jest.fn(),
  onCycleTheme: jest.fn(),
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

function renderView(
  state: HomeViewState,
  soundEnabled = true,
  themePreference: "system" | "light" | "dark" = "system",
) {
  return render(
    <HomeView
      state={state}
      soundEnabled={soundEnabled}
      themePreference={themePreference}
      {...handlers}
    />,
  );
}

beforeEach(() => jest.clearAllMocks());

describe("HomeView", () => {
  it("has a sound switch that says what pressing it does", async () => {
    await renderView(ready);
    await fireEvent.press(screen.getByRole("button", { name: "Silenciar sonidos" }));
    expect(handlers.onToggleSound).toHaveBeenCalledTimes(1);

    await renderView(ready, false);
    expect(screen.getByRole("button", { name: "Activar sonidos" })).toBeOnTheScreen();
  });

  it("has a theme switch next to the sound one, naming the current theme", async () => {
    await renderView(ready);
    await fireEvent.press(screen.getByRole("button", { name: "Tema: Sistema. Cambiar tema" }));
    expect(handlers.onCycleTheme).toHaveBeenCalledTimes(1);

    await renderView(ready, true, "dark");
    expect(screen.getByRole("button", { name: "Tema: Oscuro. Cambiar tema" })).toBeOnTheScreen();
  });

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

describe("HomeView completion check", () => {
  const lessons = {
    level: "A2",
    items: [
      { id: "a", title: "Saludos", topic: "greetings", done: true },
      { id: "b", title: "Mi rutina", topic: "daily-routine", done: true, justCompleted: true },
      { id: "c", title: "La ciudad", topic: "city", done: false },
    ],
  } as const;

  // The check is drawn by revealing it left to right; its clip's width is how much is drawn.
  async function drawnWidth(id: string) {
    const check = screen.getByTestId(`check-${id}`, { includeHiddenElements: true });
    await fireEvent(check, "layout", { nativeEvent: { layout: { width: 22, height: 18 } } });
    const clip = screen.getByTestId(`check-${id}`, { includeHiddenElements: true })
      .children[0] as unknown;
    return StyleSheet.flatten((clip as { props: { style: unknown } }).props.style as never)?.width;
  }

  it("marks done lessons with a hand-drawn check, pending ones without", async () => {
    await renderView({ ...ready, lessons });

    expect(screen.getByTestId("check-a", { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.queryByTestId("check-c", { includeHiddenElements: true })).not.toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Mi rutina, completada" })).toBeOnTheScreen();
  });

  it("draws the check of a lesson just completed, and shows older ones already drawn", async () => {
    withMotion();
    await renderView({ ...ready, lessons });

    expect(await drawnWidth("a")).toBeGreaterThan(0);
    expect(await drawnWidth("b")).toBe(0);
  });

  it("shows every check already drawn with reduced motion", async () => {
    await renderView({ ...ready, lessons });

    expect(await drawnWidth("b")).toBeGreaterThan(0);
  });
});

describe("HomeView sticker path", () => {
  const lessons = {
    level: "A2",
    items: [
      { id: "a", title: "Saludos", topic: "greetings", done: true },
      { id: "b", title: "Mi rutina", topic: "daily-routine", done: true },
      { id: "c", title: "La ciudad", topic: "city", done: false },
      { id: "d", title: "El clima", topic: "city", done: false },
    ],
  } as const;

  it("shows the streak as a chain of paperclips, one per day", async () => {
    await renderView({ ...ready, streakDays: 3 });

    expect(screen.getAllByTestId("clip", { includeHiddenElements: true })).toHaveLength(3);
    expect(screen.getByLabelText("Racha: 3 días")).toBeOnTheScreen();
  });

  it("shows the XP as sheets of stickers", async () => {
    await renderView({ ...ready, xp: 1090 });

    expect(screen.getByText("1090 XP")).toBeOnTheScreen();
    expect(screen.getByRole("progressbar", { name: "Hoja 5 de stickers" })).toBeOnTheScreen();
    expect(screen.getByText("160 XP para la próxima hoja")).toBeOnTheScreen();
  });

  it("marks the first lesson not done yet as the next one, where Avi waits", async () => {
    await renderView({ ...ready, lessons });

    expect(screen.getByRole("button", { name: "La ciudad" })).toHaveProp(
      "accessibilityHint",
      "Tu siguiente lección",
    );
    expect(screen.getByRole("button", { name: "El clima" })).not.toHaveProp(
      "accessibilityHint",
      "Tu siguiente lección",
    );
    expect(screen.getByText("Siguiente")).toBeOnTheScreen();
    expect(screen.getByTestId("avi-guide", { includeHiddenElements: true })).toBeTruthy();
  });

  it("has no next lesson, and no Avi on the path, once the level is done", async () => {
    await renderView({
      ...ready,
      lessons: { level: "A2", items: lessons.items.map((l) => ({ ...l, done: true })) },
    });

    expect(screen.queryByText("Siguiente")).not.toBeOnTheScreen();
    expect(
      screen.queryByTestId("avi-guide", { includeHiddenElements: true }),
    ).not.toBeOnTheScreen();
  });

  it("gives every lesson a touch target of at least 48 points", async () => {
    await renderView({ ...ready, lessons });

    for (const name of ["Saludos, completada", "La ciudad", "El clima"]) {
      const style = StyleSheet.flatten(screen.getByRole("button", { name }).props.style);
      expect(style.minHeight).toBeGreaterThanOrEqual(48);
    }
  });
});

describe("HomeView album", () => {
  it("opens the album, saying how many stickers are won", async () => {
    const onOpenAlbum = jest.fn();
    await render(
      <HomeView
        state={{ ...ready, album: { unlocked: 3, total: 16 } }}
        soundEnabled
        themePreference="system"
        {...handlers}
        onOpenAlbum={onOpenAlbum}
      />,
    );

    expect(screen.getByText("3 de 16 insignias")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Mi álbum: 3 de 16 insignias" }));
    expect(onOpenAlbum).toHaveBeenCalledTimes(1);
  });
});

describe("HomeView nothing to review", () => {
  it("shows Avi napping, invisible to screen readers, only when there is nothing to review", async () => {
    await renderView(ready);

    expect(screen.queryByTestId("avi-nap")).not.toBeOnTheScreen();
    expect(screen.getByTestId("avi-nap", { includeHiddenElements: true })).toBeTruthy();

    await renderView({ ...ready, pendingReviews: 3 });
    expect(screen.queryByTestId("avi-nap", { includeHiddenElements: true })).not.toBeOnTheScreen();
  });
});
