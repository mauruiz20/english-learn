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
});
