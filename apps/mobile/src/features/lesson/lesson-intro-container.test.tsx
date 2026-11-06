import { createCorpus, type Item, type Lesson, type LessonIntro } from "@english-learn/content";
import { initialState, localDate, review } from "@english-learn/domain";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { AppServicesProvider } from "@/infrastructure/services/app-services";
import {
  createFakeRepository,
  type FakeProgressRepository,
} from "@/testing/fake-progress-repository";
import { createFakeSettingsRepository } from "@/testing/fake-settings-repository";
import { createFakeSoundPlayer } from "@/testing/fake-sound-player";
import { createPreventRemoveMock } from "@/testing/prevent-remove";
import { testRandomBytes } from "@/testing/random-bytes";
import { LessonContainer } from "./lesson-container";
import { allExercises, card, lesson, passage, sequenceRng } from "./model/fixtures";

const mockRouter = {
  canDismiss: jest.fn(() => true),
  canGoBack: jest.fn(() => true),
  dismissAll: jest.fn(),
  replace: jest.fn(),
  push: jest.fn(),
  back: jest.fn(),
};
const mockPreventRemove = createPreventRemoveMock();
jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
  usePreventRemove: (...args: Parameters<typeof mockPreventRemove.hook>) =>
    mockPreventRemove.hook(...args),
  Stack: { Screen: () => null },
}));

const TODAY = localDate("2026-10-29");
const item = (id: string, term: string, es: string): Item => ({
  id,
  level: "A2",
  topics: ["routine"],
  kind: "word",
  term,
  es,
});

const intro: LessonIntro = {
  points: ["Para la rutina se usa el presente simple.", "«Usually» va antes del verbo."],
  examples: [{ en: "I usually wake up at six.", es: "Normalmente me despierto a las seis." }],
  mistake: {
    wrong: "I take breakfast at seven.",
    right: "I have breakfast at seven.",
    note: "«Tomar el desayuno» es «have breakfast».",
  },
};
const withIntro: Lesson = { ...lesson, intro };
const withCard: Lesson = { ...lesson, id: "a2.routine.lesson-002", deepenCardIds: [card.id] };
const practiceLesson: Lesson = {
  ...lesson,
  id: "a2.routine.practice-routine-1",
  intro,
};

const content = createCorpus([
  {
    items: [item("a2.routine.wake-up", "wake up", "despertarse")],
    exercises: allExercises,
    passages: [passage],
    lessons: [withIntro, withCard, practiceLesson],
    cards: [card],
    practice: [
      {
        id: "practice.routine",
        title: "Rutina",
        summary: "Practica la rutina.",
        groups: [
          {
            id: "practice.routine.day",
            level: "A2",
            title: "El día",
            summary: "Tu día.",
            lessonIds: [practiceLesson.id],
          },
        ],
      },
    ],
  },
]);

function renderLesson(
  lessonId: string,
  repository: FakeProgressRepository = createFakeRepository(),
) {
  return render(
    <AppServicesProvider
      services={{
        progressRepository: repository,
        clock: { today: () => TODAY, nowMs: () => 0 },
        random: sequenceRng([0.3, 0.8, 0.1, 0.6]),
        randomBytes: testRandomBytes,
        deviceId: "test-device",
        settingsRepository: createFakeSettingsRepository(),
        sounds: createFakeSoundPlayer(),
      }}
    >
      <LessonContainer lessonId={lessonId} content={content} />
    </AppServicesProvider>,
  );
}

async function press(name: string, role: "button" | "radio" = "button") {
  await fireEvent.press(screen.getByRole(role, { name }));
}

/** Answers every fixture exercise correctly, continuing after each feedback. */
async function playCorrectly() {
  await press("despertarse", "radio");
  await press("Comprobar");
  await press("Continuar");
  await press("have", "radio");
  await press("Comprobar");
  await press("Continuar");
  for (const token of ["I", "usually", "wake", "up"]) await press(token);
  await press("Comprobar");
  await press("Continuar");
  await press("Ella se acuesta a las once.", "radio");
  await press("Comprobar");
  await press("Continuar");
  await press("At six thirty", "radio");
  await press("By bus", "radio");
  await press("Comprobar");
  await press("Continuar");
  await fireEvent.changeText(
    screen.getByLabelText("Tu traducción en inglés"),
    "I usually go to bed at eleven",
  );
  await press("Comprobar");
  await press("Continuar");
}

beforeEach(() => jest.clearAllMocks());

describe("LessonContainer intro", () => {
  it("shows the intro before the first exercise, then starts the lesson", async () => {
    await renderLesson(withIntro.id);

    expect(await screen.findByRole("header", { name: "Antes de empezar" })).toBeOnTheScreen();
    expect(screen.getByText("Mi rutina")).toBeOnTheScreen();
    expect(screen.getByText("«Usually» va antes del verbo.")).toBeOnTheScreen();
    expect(screen.getByLabelText("Correcto: I have breakfast at seven.")).toBeOnTheScreen();
    expect(screen.queryByText("Ejercicio 1 de 6")).not.toBeOnTheScreen();

    await press("Empezar");

    expect(screen.getByText("Ejercicio 1 de 6")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Repasar la teoría" })).not.toBeOnTheScreen();
  });

  it("collapses the intro on a redo: a toggle above the first exercise", async () => {
    await renderLesson(withIntro.id);
    await fireEvent.press(await screen.findByRole("button", { name: "Empezar" }));
    await playCorrectly();

    await fireEvent.press(await screen.findByRole("button", { name: "Repetir lección" }));

    expect(screen.getByText("Ejercicio 1 de 6")).toBeOnTheScreen();
    expect(screen.queryByRole("header", { name: "Antes de empezar" })).not.toBeOnTheScreen();
    await press("Repasar la teoría");
    expect(screen.getByText("«Usually» va antes del verbo.")).toBeOnTheScreen();
  });

  it("collapses the intro of a lesson already completed", async () => {
    const itemIds = [...new Set(allExercises.flatMap((e) => e.itemIds))];
    const states = itemIds.map((id) => review(initialState(id, TODAY), 5, TODAY));
    await renderLesson(withIntro.id, createFakeRepository({ states }));

    expect(await screen.findByText("Ejercicio 1 de 6")).toBeOnTheScreen();
    expect(screen.queryByRole("header", { name: "Antes de empezar" })).not.toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Repasar la teoría" })).toBeOnTheScreen();
  });

  it("derives the intro from the linked card when the lesson has none", async () => {
    await renderLesson(withCard.id);

    expect(await screen.findByRole("header", { name: "Antes de empezar" })).toBeOnTheScreen();
    expect(screen.getByText(card.uses[0]!)).toBeOnTheScreen();
    expect(screen.getByText(card.examples[0]!.es)).toBeOnTheScreen();
    expect(screen.getByLabelText(`Correcto: ${card.pitfalls[0]!.right}`)).toBeOnTheScreen();
  });

  it("shows no intro in a practice lesson", async () => {
    await renderLesson(practiceLesson.id);

    expect(screen.getByText("Ejercicio 1 de 6")).toBeOnTheScreen();
    expect(screen.queryByRole("header", { name: "Antes de empezar" })).not.toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Repasar la teoría" })).not.toBeOnTheScreen();
  });

  it("reopens the intro from the summary and goes back to it", async () => {
    await renderLesson(withIntro.id);
    await fireEvent.press(await screen.findByRole("button", { name: "Empezar" }));
    await playCorrectly();

    await fireEvent.press(await screen.findByRole("button", { name: "Ver teoría" }));
    expect(screen.getByRole("header", { name: "Antes de empezar" })).toBeOnTheScreen();

    await press("Volver al resumen");
    expect(screen.getByText("¡Lección completada!")).toBeOnTheScreen();
  });
});
