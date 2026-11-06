import { fireEvent, render, screen } from "@testing-library/react-native";
import { ProgressView, type ProgressViewState } from "./progress-view";

const ready: ProgressViewState = {
  status: "ready",
  counts: { mastered: 4, learning: 7, hard: 2 },
  canPractice: true,
  hardWords: [
    {
      itemId: "a2.routine.go-to-bed",
      term: "go to bed",
      es: "acostarse",
      speakText: "go to bed",
      card: undefined,
      lapses: 3,
      recentAccuracy: 0.4,
    },
    {
      itemId: "a2.routine.wake-up",
      term: "wake up",
      es: "despertarse",
      speakText: "wake up",
      card: { id: "a2.phrasal-verbs.routine", title: "Phrasal verbs: la rutina" },
      lapses: 1,
      recentAccuracy: null,
    },
  ],
};

async function renderView(state: ProgressViewState) {
  const onPractice = jest.fn();
  const onOpenCard = jest.fn();
  await render(<ProgressView state={state} onPractice={onPractice} onOpenCard={onOpenCard} />);
  return { onPractice, onOpenCard };
}

describe("ProgressView", () => {
  it("shows a loading indicator, then an error", async () => {
    await renderView({ status: "loading" });
    expect(screen.getByLabelText("Cargando tu progreso")).toBeOnTheScreen();
    await renderView({ status: "error" });
    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos cargar tu progreso.");
  });

  it("shows the three bucket counts as text and as one labelled bar", async () => {
    await renderView(ready);
    expect(screen.getByText("Tu progreso")).toBeOnTheScreen();
    expect(
      screen.getByLabelText("13 palabras: 4 dominadas, 7 en proceso, 2 difíciles"),
    ).toBeOnTheScreen();
    expect(screen.getByTestId("bucket-count-mastered")).toHaveTextContent("4");
    expect(screen.getByTestId("bucket-count-learning")).toHaveTextContent("7");
    expect(screen.getByTestId("bucket-count-hard")).toHaveTextContent("2");
    expect(screen.getByText("Dominadas")).toBeOnTheScreen();
    expect(screen.getByText("En proceso")).toBeOnTheScreen();
    expect(screen.getByText("Difíciles")).toBeOnTheScreen();
  });

  it("lists the difficult words with their meaning and a link to their card", async () => {
    const { onOpenCard } = await renderView(ready);
    expect(screen.getByText("Mis palabras difíciles")).toBeOnTheScreen();
    expect(screen.getByText("go to bed")).toBeOnTheScreen();
    expect(screen.getByText("acostarse")).toBeOnTheScreen();
    expect(screen.getByText("Olvidada 3 veces · 40 % de aciertos recientes")).toBeOnTheScreen();
    expect(screen.getByText("Olvidada 1 vez")).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole("button", { name: "Ver ficha: Phrasal verbs: la rutina" }),
    );
    expect(onOpenCard).toHaveBeenCalledWith("a2.phrasal-verbs.routine");
    expect(screen.getAllByRole("button", { name: /^Ver ficha/ })).toHaveLength(1);
  });

  it("starts the practice of the difficult words", async () => {
    const { onPractice } = await renderView(ready);
    await fireEvent.press(screen.getByRole("button", { name: "Practicar mis palabras difíciles" }));
    expect(onPractice).toHaveBeenCalled();
  });

  it("offers no practice when no exercise can practice them", async () => {
    await renderView({ ...ready, canPractice: false });
    expect(
      screen.queryByRole("button", { name: "Practicar mis palabras difíciles" }),
    ).not.toBeOnTheScreen();
  });

  it("congratulates when nothing is difficult", async () => {
    await renderView({ ...ready, counts: { mastered: 4, learning: 7, hard: 0 }, hardWords: [] });
    expect(screen.getByText("No tienes palabras difíciles. ¡Sigue así!")).toBeOnTheScreen();
    expect(
      screen.queryByRole("button", { name: "Practicar mis palabras difíciles" }),
    ).not.toBeOnTheScreen();
  });

  it("explains where the numbers come from before any review", async () => {
    await renderView({ ...ready, counts: { mastered: 0, learning: 0, hard: 0 }, hardWords: [] });
    expect(
      screen.getByText(
        "Todavía no hay palabras repasadas. Haz una lección y aquí verás cómo avanzas.",
      ),
    ).toBeOnTheScreen();
    expect(screen.queryByText("Mis palabras difíciles")).not.toBeOnTheScreen();
  });
});
