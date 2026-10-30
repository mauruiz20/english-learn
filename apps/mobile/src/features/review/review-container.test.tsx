import { createCorpus, type Exercise, type Item } from "@english-learn/content";
import { addDays, initialState, localDate, review, type ReviewState } from "@english-learn/domain";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { cloze, vocab, wordOrder } from "@/features/lesson/model/fixtures";
import { AppServicesProvider } from "@/infrastructure/services/app-services";
import {
  createFakeRepository,
  type FakeProgressRepository,
} from "@/testing/fake-progress-repository";
import { createFakeSettingsRepository } from "@/testing/fake-settings-repository";
import { createFakeSoundPlayer, type FakeSoundPlayer } from "@/testing/fake-sound-player";
import { createPreventRemoveMock } from "@/testing/prevent-remove";
import { ReviewContainer } from "./review-container";
import { testRandomBytes } from "@/testing/random-bytes";

const mockRouter = { canDismiss: jest.fn(() => true), dismissAll: jest.fn(), replace: jest.fn() };
const mockScreenOptions = jest.fn();
const mockPreventRemove = createPreventRemoveMock();
jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
  usePreventRemove: (...args: Parameters<typeof mockPreventRemove.hook>) =>
    mockPreventRemove.hook(...args),
  Stack: {
    Screen: ({ options }: { options: unknown }) => {
      mockScreenOptions(options);
      return null;
    },
  },
}));

const TODAY = localDate("2026-10-29");
const YESTERDAY = addDays(TODAY, -1);

/** Learned yesterday: due today. */
const learnedYesterday = (itemId: string): ReviewState =>
  review(initialState(itemId, YESTERDAY), 5, YESTERDAY);

const item = (id: string, term: string, es: string): Item => ({
  id,
  level: "A2",
  topics: ["routine"],
  kind: "word",
  term,
  es,
});
const items = [
  item("a2.routine.wake-up", "wake up", "despertarse"),
  item("a2.routine.usually", "usually", "normalmente"),
];

function renderReview(repository: FakeProgressRepository, exercises: Exercise[] = [vocab, cloze]) {
  const content = createCorpus([{ items, exercises }]);
  return render(
    <AppServicesProvider
      services={{
        progressRepository: repository,
        clock: { today: () => TODAY, nowMs: () => 0 },
        random: () => 0,
        randomBytes: testRandomBytes,
        deviceId: "test-device",
        settingsRepository: createFakeSettingsRepository(),
        sounds,
      }}
    >
      <ReviewContainer content={content} />
    </AppServicesProvider>,
  );
}

async function answer(option: string, button: "radio" | "button" = "radio") {
  await fireEvent.press(screen.getByRole(button, { name: option }));
}

let sounds: FakeSoundPlayer;
beforeEach(() => {
  jest.clearAllMocks();
  sounds = createFakeSoundPlayer();
});

describe("ReviewContainer", () => {
  it("shows an empty state when nothing is due", async () => {
    await renderReview(
      createFakeRepository({ states: [review(initialState(vocab.itemIds[0]!, TODAY), 5, TODAY)] }),
    );

    expect(await screen.findByText("Nada para repasar hoy")).toBeOnTheScreen();
  });

  it("reviews the due items, saves them with answer XP only and the streak", async () => {
    const repository = createFakeRepository({
      xp: 100,
      streak: { current: 1, longest: 1, lastActiveDate: YESTERDAY },
      states: [learnedYesterday("a2.routine.wake-up"), learnedYesterday("a2.routine.breakfast")],
    });
    await renderReview(repository);

    expect(await screen.findByText("Ejercicio 1 de 2")).toBeOnTheScreen();
    // Equal priority → item id order: breakfast (cloze), then wake-up (vocab).
    await answer("have");
    await answer("Comprobar", "button");
    expect(screen.getByRole("alert")).toHaveTextContent("Correcto");
    await answer("Continuar", "button");
    await answer("despertarse");
    await answer("Comprobar", "button");
    await answer("Continuar", "button");

    expect(await screen.findByText("¡Repaso completado!")).toBeOnTheScreen();
    expect(sounds.played.slice(0, 5)).toEqual(["tap", "correct", "tap", "correct", "complete"]);
    await waitFor(() => expect(sounds.played.slice(-1)).toEqual(["streak"]));
    expect(screen.getByText("XP ganada: 20")).toBeOnTheScreen();
    expect(screen.getByText("Racha: 2 días")).toBeOnTheScreen();
    const saved = repository.snapshot();
    expect(saved.xp).toBe(120);
    expect(saved.states.every((s) => s.reps === 2 && s.intervalDays === 6)).toBe(true);
  });

  it("lists only the missed items that were due on the summary", async () => {
    const notDue = review(initialState("a2.routine.wake-up", TODAY), 5, TODAY);
    await renderReview(
      createFakeRepository({ states: [learnedYesterday("a2.routine.usually"), notDue] }),
      [wordOrder],
    );

    for (const token of ["wake", "up", "I", "usually", "Comprobar", "Continuar"]) {
      await answer(token, "button");
    }

    expect(await screen.findByText("¡Repaso completado!")).toBeOnTheScreen();
    expect(screen.getByText("usually")).toBeOnTheScreen();
    expect(screen.getByText("normalmente")).toBeOnTheScreen();
    expect(screen.queryByText("wake up")).not.toBeOnTheScreen();
  });

  it("leaves items that are not due untouched even if the exercise practices them", async () => {
    const notDue = review(initialState("a2.routine.wake-up", TODAY), 5, TODAY);
    const repository = createFakeRepository({
      states: [learnedYesterday("a2.routine.usually"), notDue],
    });
    await renderReview(repository, [wordOrder]);

    for (const token of ["I", "usually", "wake", "up", "Comprobar", "Continuar"]) {
      await answer(token, "button");
    }

    await screen.findByText("¡Repaso completado!");
    const states = repository.snapshot().states;
    expect(states.find((s) => s.itemId === "a2.routine.wake-up")).toEqual(notDue);
    expect(states.find((s) => s.itemId === "a2.routine.usually")?.reps).toBe(2);
  });

  it("asks before leaving mid-review and leaves without saving on confirm", async () => {
    const repository = createFakeRepository({
      states: [learnedYesterday("a2.routine.wake-up"), learnedYesterday("a2.routine.breakfast")],
    });
    await renderReview(repository);
    await screen.findByText("Ejercicio 1 de 2");
    expect(mockPreventRemove.active).toBe(false);

    await answer("have");
    await answer("Comprobar", "button");
    expect(mockPreventRemove.active).toBe(true);

    let repeat = await mockPreventRemove.attemptLeave();
    expect(screen.getByText("¿Salir del repaso?")).toBeOnTheScreen();
    await answer("Seguir aquí", "button");
    expect(repeat).not.toHaveBeenCalled();
    expect(screen.queryByText("¿Salir del repaso?")).toBeNull();

    repeat = await mockPreventRemove.attemptLeave();
    await answer("Salir", "button");
    expect(repeat).toHaveBeenCalledTimes(1);
    expect(repository.snapshot().xp).toBe(0);
  });

  it("explains when the review cannot be loaded", async () => {
    const repository = createFakeRepository();
    repository.getReviewStates = () => Promise.reject(new Error("disk I/O error"));
    jest.spyOn(console, "error").mockImplementation(() => {});
    await renderReview(repository);

    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos cargar tu repaso.");
  });
});
