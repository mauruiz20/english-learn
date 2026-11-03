import { corpus } from "@english-learn/content/corpus";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { cardGroups } from "./model/card-catalog";
import { CardsView } from "./cards-view";

const onOpenCard = jest.fn();

beforeEach(() => jest.clearAllMocks());

describe("CardsView", () => {
  it("shows a loading indicator, then an error if progress cannot load", async () => {
    await render(<CardsView state={{ status: "loading" }} onOpenCard={onOpenCard} />);
    expect(screen.getByLabelText("Cargando las fichas")).toBeOnTheScreen();

    await render(<CardsView state={{ status: "error" }} onOpenCard={onOpenCard} />);
    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos cargar tu progreso.");
  });

  it("lists the cards by kind, then level, counting the studied ones", async () => {
    const groups = cardGroups(corpus.cards, []);
    await render(
      <CardsView
        state={{ status: "ready", groups, total: corpus.cards.length, studied: 0 }}
        onOpenCard={onOpenCard}
      />,
    );

    expect(screen.getByRole("header", { name: "Fichas" })).toBeOnTheScreen();
    expect(screen.getByText(`${corpus.cards.length} fichas · 0 estudiadas`)).toBeOnTheScreen();
    for (const label of ["Gramática", "Phrasal verbs", "Vocabulario"]) {
      expect(screen.getByRole("header", { name: label })).toBeOnTheScreen();
    }
    expect(screen.getAllByRole("button")).toHaveLength(corpus.cards.length);
  });

  it("marks studied and mastered cards, and opens one", async () => {
    const groups = cardGroups(corpus.cards, []).map((g) => ({
      ...g,
      levels: g.levels.map((l) => ({
        ...l,
        cards: l.cards.map((c) =>
          c.id === "b1.grammar.look-forward-to"
            ? { ...c, status: "studied" as const }
            : c.id === "b2.grammar.be-worth"
              ? { ...c, status: "mastered" as const }
              : c,
        ),
      })),
    }));
    await render(
      <CardsView
        state={{ status: "ready", groups, total: corpus.cards.length, studied: 2 }}
        onOpenCard={onOpenCard}
      />,
    );

    expect(screen.getByText(`${corpus.cards.length} fichas · 2 estudiadas`)).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Be worth + -ing, B2, dominada" })).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole("button", { name: "Look forward to + -ing, B1, estudiada" }),
    );
    expect(onOpenCard).toHaveBeenCalledWith("b1.grammar.look-forward-to");
    expect(screen.getByRole("button", { name: "Say o tell, A2" })).toBeOnTheScreen();
  });

  it("shows a practiced card's best result, with a star when every answer was right", async () => {
    const scored = (id: string, score: { correct: number; total: number; perfect: boolean }) =>
      cardGroups(corpus.cards, []).map((g) => ({
        ...g,
        levels: g.levels.map((l) => ({
          ...l,
          cards: l.cards.map((c) =>
            c.id === id ? { ...c, status: "studied" as const, score } : c,
          ),
        })),
      }));
    const groups = scored("b1.grammar.look-forward-to", { correct: 6, total: 6, perfect: true });
    await render(
      <CardsView
        state={{ status: "ready", groups, total: corpus.cards.length, studied: 1 }}
        onOpenCard={onOpenCard}
      />,
    );

    expect(
      screen.getByRole("button", {
        name: "Look forward to + -ing, B1, estudiada, completada sin errores: 6 de 6 correctas",
      }),
    ).toBeOnTheScreen();
    expect(screen.getByText("Perfecta · 6/6")).toBeOnTheScreen();
    expect(
      screen.getByTestId("card-perfect-b1.grammar.look-forward-to", {
        includeHiddenElements: true,
      }),
    ).toBeOnTheScreen();
    // Cards never practiced show nothing new.
    expect(screen.getByRole("button", { name: "Say o tell, A2" })).toBeOnTheScreen();
    expect(screen.getAllByText(/^(Perfecta|Completada) · /)).toHaveLength(1);

    const withMistakes = scored("b1.grammar.look-forward-to", {
      correct: 5,
      total: 6,
      perfect: false,
    });
    await render(
      <CardsView
        state={{ status: "ready", groups: withMistakes, total: corpus.cards.length, studied: 1 }}
        onOpenCard={onOpenCard}
      />,
    );
    expect(
      screen.getByRole("button", {
        name: "Look forward to + -ing, B1, estudiada, completada con errores: 5 de 6 correctas",
      }),
    ).toBeOnTheScreen();
    expect(screen.getByText("Completada · 5/6")).toBeOnTheScreen();
    expect(
      screen.queryByTestId("card-perfect-b1.grammar.look-forward-to", {
        includeHiddenElements: true,
      }),
    ).not.toBeOnTheScreen();
  });
});
