import { createCorpus, type Exercise } from "@english-learn/content";
import { addDays, initialState, localDate, review, type ReviewState } from "@english-learn/domain";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { cloze, vocab, wordOrder } from "@/features/lesson/model/fixtures";
import { AppServicesProvider } from "@/infrastructure/services/app-services";
import {
  createFakeRepository,
  type FakeProgressRepository,
} from "@/testing/fake-progress-repository";
import { ReviewContainer } from "./review-container";

const mockRouter = { canDismiss: jest.fn(() => true), dismissAll: jest.fn(), replace: jest.fn() };
const mockScreenOptions = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
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

function renderReview(repository: FakeProgressRepository, exercises: Exercise[] = [vocab, cloze]) {
  const content = createCorpus([{ exercises }]);
  return render(
    <AppServicesProvider
      services={{
        progressRepository: repository,
        clock: { today: () => TODAY, nowMs: () => 0 },
        random: () => 0,
      }}
    >
      <ReviewContainer content={content} />
    </AppServicesProvider>,
  );
}

async function answer(option: string, button: "radio" | "button" = "radio") {
  await fireEvent.press(screen.getByRole(button, { name: option }));
}

beforeEach(() => jest.clearAllMocks());

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
    expect(screen.getByText("XP ganada: 20")).toBeOnTheScreen();
    expect(screen.getByText("Racha: 2 días")).toBeOnTheScreen();
    const saved = repository.snapshot();
    expect(saved.xp).toBe(120);
    expect(saved.states.every((s) => s.reps === 2 && s.intervalDays === 6)).toBe(true);
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

  it("explains when the review cannot be loaded", async () => {
    const repository = createFakeRepository();
    repository.getReviewStates = () => Promise.reject(new Error("disk I/O error"));
    jest.spyOn(console, "error").mockImplementation(() => {});
    await renderReview(repository);

    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos cargar tu repaso.");
  });
});
