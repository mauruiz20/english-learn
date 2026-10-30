import { fireEvent, render, screen } from "@testing-library/react-native";
import { HomeView, type HomeViewState } from "./home-view";

const handlers = {
  onStartPlacement: jest.fn(),
  onOpenReview: jest.fn(),
  onOpenAbout: jest.fn(),
};

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
    await renderView({ status: "ready", streakDays: 0, xp: 0, level: null });

    expect(screen.getByText("Racha: 0 días")).toBeOnTheScreen();
    expect(screen.getByText("XP: 0")).toBeOnTheScreen();
    expect(screen.getByText("Aún no conocemos tu nivel.")).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("button", { name: "Hacer test de nivel" }));
    expect(handlers.onStartPlacement).toHaveBeenCalledTimes(1);
  });

  it("shows the level and hides the placement CTA once placed", async () => {
    await renderView({ status: "ready", streakDays: 5, xp: 120, level: "B1" });

    expect(screen.getByText("Racha: 5 días")).toBeOnTheScreen();
    expect(screen.getByText("XP: 120")).toBeOnTheScreen();
    expect(screen.getByText("Tu nivel: B1")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Hacer test de nivel" })).not.toBeOnTheScreen();
  });

  it("uses the singular for a one-day streak", async () => {
    await renderView({ status: "ready", streakDays: 1, xp: 10, level: "A2" });

    expect(screen.getByText("Racha: 1 día")).toBeOnTheScreen();
  });

  it("navigates to review and about", async () => {
    await renderView({ status: "ready", streakDays: 0, xp: 0, level: "A2" });

    await fireEvent.press(screen.getByRole("button", { name: "Repasar" }));
    await fireEvent.press(screen.getByRole("button", { name: "Acerca de" }));

    expect(handlers.onOpenReview).toHaveBeenCalledTimes(1);
    expect(handlers.onOpenAbout).toHaveBeenCalledTimes(1);
  });
});
