import { createCorpus, type Item } from "@english-learn/content";
import { localDate } from "@english-learn/domain";
import { fireEvent, render, screen } from "@testing-library/react-native";
import {
  card,
  lesson,
  allExercises,
  passage,
  vocab,
  wordOrder,
} from "@/features/lesson/model/fixtures";
import { AppServicesProvider } from "@/infrastructure/services/app-services";
import {
  createFakeRepository,
  type FakeProgressRepository,
} from "@/testing/fake-progress-repository";
import { createFakeSettingsRepository } from "@/testing/fake-settings-repository";
import { createFakeSoundPlayer } from "@/testing/fake-sound-player";
import { createPreventRemoveMock } from "@/testing/prevent-remove";
import { testRandomBytes } from "@/testing/random-bytes";
import { CardPracticeContainer } from "./card-practice-container";

const mockRouter = {
  canGoBack: jest.fn(() => true),
  back: jest.fn(),
  replace: jest.fn(),
  push: jest.fn(),
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
  topics: ["routine", "phrasal-verbs"],
  kind: "word",
  term,
  es,
});
const content = createCorpus([
  {
    items: [item("a2.routine.wake-up", "wake up", "despertarse")],
    exercises: allExercises,
    passages: [passage],
    lessons: [lesson],
    cards: [card],
  },
]);

function renderPractice(repository: FakeProgressRepository, cardId = card.id) {
  return render(
    <AppServicesProvider
      services={{
        progressRepository: repository,
        clock: { today: () => TODAY, nowMs: () => 0 },
        random: () => 0,
        randomBytes: testRandomBytes,
        deviceId: "test-device",
        settingsRepository: createFakeSettingsRepository(),
        sounds: createFakeSoundPlayer(),
      }}
    >
      <CardPracticeContainer cardId={cardId} content={content} />
    </AppServicesProvider>,
  );
}

async function press(name: string, role: "button" | "radio" = "button") {
  await fireEvent.press(screen.getByRole(role, { name }));
}

beforeEach(() => jest.clearAllMocks());

describe("CardPracticeContainer", () => {
  it("practices the card's exercises and saves them like a lesson with the card's id", async () => {
    const repository = createFakeRepository();
    await renderPractice(repository);

    expect(screen.getByText("Phrasal verbs: la rutina")).toBeOnTheScreen();
    expect(screen.getByText(`Ejercicio 1 de ${card.exerciseIds.length}`)).toBeOnTheScreen();
    expect(screen.getByTestId(`exercise-${vocab.id}`)).toBeOnTheScreen();
    await press("despertarse", "radio");
    await press("Comprobar");
    await press("Continuar");
    expect(screen.getByTestId(`exercise-${wordOrder.id}`)).toBeOnTheScreen();
    for (const token of ["I", "usually", "wake", "up"]) await press(token);
    await press("Comprobar");
    await press("Continuar");

    expect(await screen.findByText("¡Práctica completada!")).toBeOnTheScreen();
    // Answer XP (2 × 10) plus the first-time completion bonus, like a lesson.
    expect(screen.getByText("XP ganada: 40")).toBeOnTheScreen();
    const session = repository.events().find((e) => e.type === "session_completed");
    expect(session?.payload).toMatchObject({ kind: "lesson", lessonId: card.id });
    // Its items enter spaced repetition like a lesson's.
    expect(
      repository
        .snapshot()
        .states.map((s) => s.itemId)
        .sort(),
    ).toEqual(["a2.routine.usually", "a2.routine.wake-up"]);
  });

  it("goes back to the card after the summary", async () => {
    await renderPractice(createFakeRepository());
    await press("despertarse", "radio");
    await press("Comprobar");
    await press("Continuar");
    for (const token of ["I", "usually", "wake", "up"]) await press(token);
    await press("Comprobar");
    await press("Continuar");

    await screen.findByRole("button", { name: "Volver a la ficha" });
    await press("Volver a la ficha");
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it("does not offer 'Ver ficha' while practicing the card itself", async () => {
    await renderPractice(createFakeRepository());

    await press("dormirse", "radio");
    await press("Comprobar");

    expect(screen.getByRole("alert")).toHaveTextContent(/^Incorrecto/);
    expect(screen.queryByRole("button", { name: /^Ver ficha/ })).not.toBeOnTheScreen();
  });

  it("explains an unknown card", async () => {
    await renderPractice(createFakeRepository(), "a2.grammar.nope");

    expect(screen.getByText("No encontramos esta ficha.")).toBeOnTheScreen();
  });
});
