import type { Card } from "@english-learn/content";
import { corpus } from "@english-learn/content/corpus";
import { fireEvent, render, screen, within } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { GlossaryProvider } from "@/features/glossary/glossary-provider";
import { AppServicesProvider } from "@/infrastructure/services/app-services";
import { createFakeRepository } from "@/testing/fake-progress-repository";
import { createFakeSettingsRepository } from "@/testing/fake-settings-repository";
import { createFakeSoundPlayer } from "@/testing/fake-sound-player";
import { testRandomBytes } from "@/testing/random-bytes";
import { CardView, type CardViewProps } from "./card-view";

const grammar = corpus.cardsById.get("b1.grammar.look-forward-to")!;
const phrasal = corpus.cardsById.get("b1.phrasal-verbs.plans")!;
const vocabulary = corpus.cardsById.get("b1.vocabulary.actually")!;

const handlers = { onPractice: jest.fn(), onBack: jest.fn() };

function renderCard(card: Card, props: Partial<CardViewProps> = {}) {
  return render(
    <AppServicesProvider
      services={{
        progressRepository: createFakeRepository(),
        clock: { today: () => "2030-01-01" as never, nowMs: () => 0 },
        random: () => 0,
        randomBytes: testRandomBytes,
        deviceId: "test-device",
        settingsRepository: createFakeSettingsRepository({ lookupHintDismissed: true }),
        sounds: createFakeSoundPlayer(),
      }}
    >
      <GlossaryProvider index={corpus.glossaryIndex}>
        <CardView card={card} status="new" fromSession={false} {...handlers} {...props} />
      </GlossaryProvider>
    </AppServicesProvider>,
  );
}

beforeEach(() => jest.clearAllMocks());

describe("CardView", () => {
  it("shows the title, its kind and level, the summary and the form", async () => {
    await renderCard(grammar);

    expect(screen.getByRole("header", { name: "Look forward to + -ing" })).toBeOnTheScreen();
    expect(screen.getByText("Gramática")).toBeOnTheScreen();
    expect(screen.getByText("B1")).toBeOnTheScreen();
    expect(screen.getByText(grammar.summary)).toBeOnTheScreen();
    expect(screen.getByLabelText(`Estructura: ${grammar.form}`)).toBeOnTheScreen();
    for (const use of grammar.uses) expect(screen.getByText(use)).toBeOnTheScreen();
  });

  it("strikes each pitfall's mistake in red pen, without lookups, then gives the right sentence and why", async () => {
    await renderCard(grammar);
    const [pitfall] = grammar.pitfalls;

    const wrong = screen.getByLabelText(`Incorrecto: ${pitfall!.wrong}`);
    expect(StyleSheet.flatten(wrong.props.style)).toMatchObject({
      textDecorationLine: "line-through",
    });
    expect(within(wrong).queryAllByRole("button")).toHaveLength(0);
    expect(screen.getAllByLabelText("Correcto").length).toBe(grammar.pitfalls.length);
    expect(screen.getByText(pitfall!.why)).toBeOnTheScreen();
  });

  it("lets the learner look up the English words of the examples, with the Spanish under each", async () => {
    await renderCard(grammar);

    expect(
      screen.getAllByRole("button", { name: "weekend, ver traducción" }).length,
    ).toBeGreaterThan(0);
    for (const example of grammar.examples) expect(screen.getByText(example.es)).toBeOnTheScreen();
  });

  it("lists a phrasal-verb card's verbs, marking the separable ones", async () => {
    await renderCard(phrasal);

    expect(screen.getByText("Los verbos")).toBeOnTheScreen();
    const separable =
      phrasal.kind === "phrasal_verbs" ? phrasal.entries.filter((e) => e.separable) : [];
    expect(screen.getAllByText("separable")).toHaveLength(separable.length);
    expect(screen.getByText(/turn it off/)).toBeOnTheScreen();
    expect(screen.getByText("posponer, aplazar")).toBeOnTheScreen();
  });

  it("shows a vocabulary card's false friend", async () => {
    await renderCard(vocabulary);

    expect(screen.getByText("Falso amigo")).toBeOnTheScreen();
    expect(screen.getByText("Parece: actualmente")).toBeOnTheScreen();
    expect(screen.getByText("Significa: en realidad, de hecho")).toBeOnTheScreen();
  });

  it("practices the card's exercises", async () => {
    await renderCard(grammar);

    await fireEvent.press(screen.getByRole("button", { name: "Practicar" }));
    expect(handlers.onPractice).toHaveBeenCalledTimes(1);
    expect(screen.getByText(`${grammar.exerciseIds.length} ejercicios`)).toBeOnTheScreen();
  });

  it("says when the card was studied or mastered", async () => {
    await renderCard(grammar, { status: "studied" });
    expect(screen.getByText("Estudiada")).toBeOnTheScreen();

    await renderCard(grammar, { status: "mastered" });
    expect(screen.getByText("Dominada")).toBeOnTheScreen();
  });

  it("opened from a session's feedback, offers to go back instead of practicing", async () => {
    await renderCard(grammar, { fromSession: true });

    expect(screen.queryByRole("button", { name: "Practicar" })).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Volver al ejercicio" }));
    expect(handlers.onBack).toHaveBeenCalledTimes(1);
  });
});
