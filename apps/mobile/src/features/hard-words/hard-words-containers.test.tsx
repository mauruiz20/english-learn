import { createCorpus, type Item } from "@english-learn/content";
import {
  addDays,
  initialState,
  localDate,
  type Grade,
  type LocalDate,
  type ProgressEvent,
  type ReviewState,
} from "@english-learn/domain";
import type React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { card, cloze, vocab } from "@/features/lesson/model/fixtures";
import { itemReviewedEvent, sessionCompletedEvent } from "@/features/progress/progress-events";
import { reviewOutlook } from "@/features/review/model/review-plan";
import { AppServicesProvider } from "@/infrastructure/services/app-services";
import {
  createFakeRepository,
  type FakeProgressRepository,
} from "@/testing/fake-progress-repository";
import { createFakeSettingsRepository } from "@/testing/fake-settings-repository";
import { createFakeSoundPlayer } from "@/testing/fake-sound-player";
import { createPreventRemoveMock } from "@/testing/prevent-remove";
import { testRandomBytes } from "@/testing/random-bytes";
import { HardPracticeContainer } from "./hard-practice-container";
import { ProgressContainer } from "./progress-container";

const mockRouter = {
  canGoBack: jest.fn(() => true),
  back: jest.fn(),
  replace: jest.fn(),
  push: jest.fn(),
};
const mockPreventRemove = createPreventRemoveMock();
jest.mock("expo-router", () => {
  const { useEffect } = jest.requireActual<typeof React>("react");
  return {
    useRouter: () => mockRouter,
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
    usePreventRemove: (...args: Parameters<typeof mockPreventRemove.hook>) =>
      mockPreventRemove.hook(...args),
    Stack: { Screen: () => null },
  };
});

const TODAY = localDate("2026-10-29");
const YESTERDAY = addDays(TODAY, -1);

const item = (id: string, term: string, es: string): Item => ({
  id,
  level: "A2",
  topics: ["routine"],
  kind: "word",
  term,
  es,
});
const content = createCorpus([
  {
    items: [
      item("a2.routine.wake-up", "wake up", "despertarse"),
      item("a2.routine.breakfast", "have breakfast", "desayunar"),
    ],
    exercises: [vocab, cloze],
    cards: [card],
  },
]);

/** One saved session of `grades` on `day`, as the app writes it. */
function session(day: LocalDate, at: number, grades: Record<string, Grade>): ProgressEvent[] {
  const stamp = {
    deviceId: "test-device",
    occurredAt: at,
    localDate: day,
    randomBytes: testRandomBytes,
  };
  const sessionId = `session-${day}-${at}`;
  return [
    ...Object.entries(grades).map(([id, grade]) => itemReviewedEvent(stamp, sessionId, id, grade)),
    sessionCompletedEvent(stamp, { sessionId, kind: "review", answerXp: 0, accuracy: 0 }),
  ];
}

/**
 * "wake up": learned yesterday, missed in today's review, so difficult and due tomorrow.
 * "have breakfast": an old item whose ease sank (difficult) and due today.
 */
function seeded(): FakeProgressRepository {
  const breakfast: ReviewState = {
    ...initialState("a2.routine.breakfast", TODAY),
    ease: 1.5,
    intervalDays: 3,
    reps: 3,
    lapses: 2,
  };
  return createFakeRepository({
    states: [breakfast],
    events: [
      ...session(YESTERDAY, 1, { "a2.routine.wake-up": 5 }),
      ...session(TODAY, 2, { "a2.routine.wake-up": 1 }),
    ],
  });
}

function renderWith(repository: FakeProgressRepository, element: React.ReactElement) {
  return render(
    <AppServicesProvider
      services={{
        progressRepository: repository,
        clock: { today: () => TODAY, nowMs: () => 10_000 },
        random: () => 0,
        randomBytes: testRandomBytes,
        deviceId: "test-device",
        settingsRepository: createFakeSettingsRepository(),
        sounds: createFakeSoundPlayer(),
      }}
    >
      {element}
    </AppServicesProvider>,
  );
}

async function press(name: string, role: "radio" | "button" = "button") {
  await fireEvent.press(screen.getByRole(role, { name }));
}

beforeEach(() => jest.clearAllMocks());

describe("ProgressContainer", () => {
  it("shows the buckets and the difficult words, hardest first", async () => {
    await renderWith(seeded(), <ProgressContainer content={content} />);

    expect(
      await screen.findByLabelText("2 palabras: 0 dominadas, 0 en proceso, 2 difíciles"),
    ).toBeOnTheScreen();
    const terms = screen.getAllByText(/^(wake up|have breakfast)$/).map((t) => t.props.children);
    expect(terms).toEqual(["wake up", "have breakfast"]);
  });

  it("opens the practice and the study card", async () => {
    await renderWith(seeded(), <ProgressContainer content={content} />);

    await press("Practicar mis palabras difíciles");
    expect(mockRouter.push).toHaveBeenCalledWith("/progreso/practicar");
    await press("Ver ficha: Phrasal verbs: la rutina");
    expect(mockRouter.push).toHaveBeenCalledWith("/fichas/a2.phrasal-verbs.routine");
  });

  it("shows an error when progress cannot be read", async () => {
    const repository = seeded();
    repository.getItemHistories = () => Promise.reject(new Error("boom"));
    jest.spyOn(console, "error").mockImplementation(() => {});
    await renderWith(repository, <ProgressContainer content={content} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos cargar tu progreso.");
  });
});

describe("HardPracticeContainer", () => {
  it("says so when nothing is difficult", async () => {
    await renderWith(createFakeRepository(), <HardPracticeContainer content={content} />);
    expect(await screen.findByText("No tienes palabras difíciles")).toBeOnTheScreen();
    await press("Volver a mi progreso");
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it("practices the difficult words, saves them like a review and says which moved on", async () => {
    const repository = seeded();
    const before = repository.snapshot();
    const wakeUpBefore = before.states.find((s) => s.itemId === "a2.routine.wake-up")!;
    await renderWith(repository, <HardPracticeContainer content={content} />);

    // Hardest first: "wake up" (missed today), then "have breakfast" (low ease).
    expect(await screen.findByText("Ejercicio 1 de 2")).toBeOnTheScreen();
    await press("despertarse", "radio");
    await press("Comprobar");
    await press("Continuar");
    await press("have", "radio");
    await press("Comprobar");
    await press("Continuar");

    expect(await screen.findByText("¡Práctica completada!")).toBeOnTheScreen();
    expect(
      await screen.findByText("1 de 2 palabras difíciles avanzó a En proceso."),
    ).toBeOnTheScreen();
    expect(screen.getByText("XP ganada: 20")).toBeOnTheScreen();

    const after = repository.snapshot();
    // Not due yet (a lapse is due tomorrow): its schedule stays put.
    expect(after.states.find((s) => s.itemId === "a2.routine.wake-up")).toEqual(wakeUpBefore);
    // Due today: a normal review moves it ahead.
    const breakfast = after.states.find((s) => s.itemId === "a2.routine.breakfast")!;
    expect(breakfast.dueDate > TODAY).toBe(true);
    // Saved like a review: answer XP only, one item_reviewed per practiced word.
    const written = repository.events().slice(-3);
    expect(written.map((e) => e.type)).toEqual([
      "item_reviewed",
      "item_reviewed",
      "session_completed",
    ]);
    expect(written[2]?.payload).toMatchObject({ kind: "review", answerXp: 20 });
    // Home's count is still the next review's size: nothing is due any more today.
    expect(
      reviewOutlook({ states: after.states, today: TODAY, exercises: content.exercises }),
    ).toEqual({ next: 0, later: 0 });

    await press("Volver a mi progreso");
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it("lapses a difficult word that is not due when it is missed again", async () => {
    const repository = seeded();
    await renderWith(repository, <HardPracticeContainer content={content} />);

    await screen.findByText("Ejercicio 1 de 2");
    await press("dormirse", "radio");
    await press("Comprobar");
    await press("Continuar");
    await press("have", "radio");
    await press("Comprobar");
    await press("Continuar");

    await screen.findByText("¡Práctica completada!");
    await waitFor(() =>
      expect(
        screen.getByText("Tus palabras siguen en Difíciles: vuelve a practicarlas pronto."),
      ).toBeOnTheScreen(),
    );
    const wakeUp = repository.snapshot().states.find((s) => s.itemId === "a2.routine.wake-up")!;
    expect(wakeUp.lapses).toBe(2);
    expect(wakeUp.dueDate).toBe(addDays(TODAY, 1));
  });
});
