import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { HomeView, type HomeLessons, type HomeViewState } from "./home-view";

const handlers = {
  onOpenLesson: jest.fn(),
  onStartPlacement: jest.fn(),
  onOpenReview: jest.fn(),
  onOpenAbout: jest.fn(),
  onToggleSound: jest.fn(),
  onCycleTheme: jest.fn(),
};

const levels = [
  { level: "A2", done: 10, total: 10 },
  { level: "B1", done: 3, total: 13 },
  { level: "B2", done: 0, total: 12 },
] as const;

const b1Path: HomeLessons = {
  level: "B1",
  autoLevel: "B1",
  chosen: false,
  levels,
  items: [
    { id: "b1.a", title: "Uno", topic: "work", done: true },
    { id: "b1.b", title: "Dos", topic: "work", done: false },
  ],
};

async function renderView(lessons: HomeLessons, onChoosePathLevel = jest.fn()) {
  const state: HomeViewState = {
    status: "ready",
    pendingReviews: 0,
    reviewNoteColor: "pink",
    streakDays: 0,
    xp: 0,
    level: "C1",
    lessons,
  };
  await render(
    <HomeView
      state={state}
      soundEnabled
      themePreference="system"
      onChoosePathLevel={onChoosePathLevel}
      {...handlers}
    />,
  );
  return onChoosePathLevel;
}

beforeEach(() => jest.clearAllMocks());

describe("the path level picker", () => {
  it("names the level shown and that it follows the automatic level", async () => {
    await renderView(b1Path);

    expect(screen.getByRole("header", { name: "Lecciones de nivel B1" })).toBeOnTheScreen();
    const chip = screen.getByRole("button", { name: "Nivel del recorrido: B1, automático" });
    expect(chip.props.accessibilityState).toMatchObject({ expanded: false });
    expect(chip.props.accessibilityHint).toBe("Muestra los niveles para elegir cuál ver");
    expect(StyleSheet.flatten(chip.props.style).minHeight).toBeGreaterThanOrEqual(44);
    expect(screen.queryByRole("radio")).not.toBeOnTheScreen();
  });

  it("says when the level was picked by hand", async () => {
    await renderView({ ...b1Path, level: "B2", chosen: true, items: [] });

    expect(
      screen.getByRole("button", { name: "Nivel del recorrido: B2, elegido a mano" }),
    ).toBeOnTheScreen();
  });

  it("offers the automatic level and every level with its progress", async () => {
    await renderView(b1Path);

    await fireEvent.press(screen.getByRole("button", { name: /^Nivel del recorrido/ }));

    expect(screen.getByLabelText("Nivel del recorrido").props.accessibilityRole).toBe("radiogroup");
    const options = screen.getAllByRole("radio").map((r) => r.props.accessibilityLabel);
    expect(options).toEqual([
      "Automático, ahora B1",
      "A2, 100 % completado",
      "B1, 23 % completado",
      "B2, 0 % completado",
    ]);
    expect(screen.getByRole("radio", { name: "Automático, ahora B1" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "B1, 23 % completado" })).not.toBeChecked();
    expect(
      screen.getByRole("button", { name: "Nivel del recorrido: B1, automático" }).props
        .accessibilityState,
    ).toMatchObject({ expanded: true });
  });

  it("picks a level by hand, then closes", async () => {
    const onChoose = await renderView(b1Path);

    await fireEvent.press(screen.getByRole("button", { name: /^Nivel del recorrido/ }));
    await fireEvent.press(screen.getByRole("radio", { name: "B2, 0 % completado" }));

    expect(onChoose).toHaveBeenCalledWith("B2");
    expect(screen.queryByRole("radio")).not.toBeOnTheScreen();
  });

  it("goes back to the automatic level", async () => {
    const onChoose = await renderView({ ...b1Path, level: "A2", chosen: true });

    await fireEvent.press(screen.getByRole("button", { name: /^Nivel del recorrido/ }));
    expect(screen.getByRole("radio", { name: "A2, 100 % completado" })).toBeChecked();
    await fireEvent.press(screen.getByRole("radio", { name: "Automático, ahora B1" }));

    expect(onChoose).toHaveBeenCalledWith(null);
  });

  it("closes without a change when the picker is pressed again", async () => {
    const onChoose = await renderView(b1Path);
    const chip = screen.getByRole("button", { name: /^Nivel del recorrido/ });

    await fireEvent.press(chip);
    await fireEvent.press(chip);

    expect(screen.queryByRole("radio")).not.toBeOnTheScreen();
    expect(onChoose).not.toHaveBeenCalled();
  });

  it("is not offered with a single level to show", async () => {
    await renderView({ ...b1Path, levels: [{ level: "B1", done: 3, total: 13 }] });

    expect(screen.queryByRole("button", { name: /^Nivel del recorrido/ })).not.toBeOnTheScreen();
  });
});
