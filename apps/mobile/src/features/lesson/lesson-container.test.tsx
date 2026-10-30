import { createCorpus } from "@english-learn/content";
import {
  initialState,
  localDate,
  review,
  type Clock,
  type SavedSession,
} from "@english-learn/domain";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { AppServicesProvider } from "@/infrastructure/services/app-services";
import {
  createFakeRepository,
  type FakeProgressRepository,
} from "@/testing/fake-progress-repository";
import { createPreventRemoveMock } from "@/testing/prevent-remove";
import { LessonContainer } from "./lesson-container";
import { allExercises, lesson, passage, sequenceRng } from "./model/fixtures";

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
const content = createCorpus([{ exercises: allExercises, passages: [passage], lessons: [lesson] }]);

function renderLesson(repository: FakeProgressRepository, lessonId = lesson.id, clock?: Clock) {
  const services = {
    progressRepository: repository,
    clock: clock ?? { today: () => TODAY, nowMs: () => 0 },
    random: sequenceRng([0.3, 0.8, 0.1, 0.6]),
  };
  return render(
    <AppServicesProvider services={services}>
      <LessonContainer lessonId={lessonId} content={content} />
    </AppServicesProvider>,
  );
}

async function press(name: string, role: "button" | "radio" = "button") {
  await fireEvent.press(screen.getByRole(role, { name }));
}

async function check() {
  await press("Comprobar");
}

/** Answers every fixture exercise correctly, continuing after each feedback. */
async function playCorrectly() {
  await press("despertarse", "radio");
  await check();
  expect(screen.getByRole("alert")).toHaveTextContent("Correcto");
  await press("Continuar");

  await press("have", "radio");
  await check();
  await press("Continuar");

  for (const token of ["I", "usually", "wake", "up"]) await press(token);
  await check();
  await press("Continuar");

  await press("Ella se acuesta a las once.", "radio");
  await check();
  await press("Continuar");

  await press("At six thirty", "radio");
  await press("By bus", "radio");
  await check();
  await press("Continuar");

  await fireEvent.changeText(
    screen.getByLabelText("Tu traducción en inglés"),
    "I usually go to bed at eleven",
  );
  await check();
  expect(screen.getByRole("alert")).toHaveTextContent("Correcto");
  await press("Continuar");
}

beforeEach(() => jest.clearAllMocks());

describe("LessonContainer", () => {
  it("plays the lesson, persists the results and shows the summary", async () => {
    const repository = createFakeRepository();
    await renderLesson(repository);

    expect(screen.getByText("Mi rutina")).toBeOnTheScreen();
    expect(screen.getByText("Ejercicio 1 de 6")).toBeOnTheScreen();
    await playCorrectly();

    expect(await screen.findByText("¡Lección completada!")).toBeOnTheScreen();
    expect(screen.getByText("Aciertos: 6 de 6")).toBeOnTheScreen();
    expect(screen.getByText("XP ganada: 80")).toBeOnTheScreen();
    expect(screen.getByText("Racha: 1 día")).toBeOnTheScreen();

    const saved = repository.snapshot();
    expect(saved.xp).toBe(80);
    expect(saved.streak).toEqual({ current: 1, longest: 1, lastActiveDate: TODAY });
    expect(saved.states.map((s) => s.itemId).sort()).toEqual([
      "a2.routine.breakfast",
      "a2.routine.commute",
      "a2.routine.go-to-bed",
      "a2.routine.usually",
      "a2.routine.wake-up",
    ]);
    expect(saved.states.every((s) => s.reps === 1)).toBe(true);
  });

  it("shows the correct answer after a mistake", async () => {
    await renderLesson(createFakeRepository());

    await press("dormirse", "radio");
    await check();

    expect(screen.getByRole("alert")).toHaveTextContent("Incorrecto");
    expect(screen.getByText("Respuesta correcta: despertarse")).toBeOnTheScreen();
    await press("Continuar");
    expect(screen.getByText("Ejercicio 2 de 6")).toBeOnTheScreen();
  });

  it("measures response time with the clock", async () => {
    let now = 0;
    const clock: Clock = { today: () => TODAY, nowMs: () => now };
    const repository = createFakeRepository();
    await renderLesson(repository, lesson.id, clock);

    // The vocab item is answered correctly but far slower than expected: grade 4, not 5.
    now = 60_000;
    await playCorrectly();
    await screen.findByText("¡Lección completada!");

    const wakeUp = repository.snapshot().states.find((s) => s.itemId === "a2.routine.wake-up");
    // wake-up also appears in the word-order exercise (answered instantly after `now` stopped moving).
    expect(wakeUp?.ease).toBeCloseTo(2.5);
    const usually = repository.snapshot().states.find((s) => s.itemId === "a2.routine.usually");
    expect(usually?.ease).toBeCloseTo(2.6);
  });

  it("returns home after the summary", async () => {
    await renderLesson(createFakeRepository());
    await playCorrectly();

    await fireEvent.press(await screen.findByRole("button", { name: "Volver al inicio" }));

    expect(mockRouter.dismissAll).toHaveBeenCalledTimes(1);
  });

  it("explains a failed save and saves on retry without duplicating anything", async () => {
    const repository = createFakeRepository();
    const save = repository.saveSessionResults;
    repository.saveSessionResults = jest
      .fn<Promise<SavedSession>, Parameters<typeof save>>()
      .mockRejectedValueOnce(new Error("disk I/O error"))
      .mockImplementation(save);
    jest.spyOn(console, "error").mockImplementation(() => {});
    await renderLesson(repository);

    await playCorrectly();

    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos guardar tu progreso.");
    expect(repository.snapshot().xp).toBe(0);

    await press("Reintentar");

    expect(await screen.findByText("¡Lección completada!")).toBeOnTheScreen();
    expect(screen.getByText("XP ganada: 80")).toBeOnTheScreen();
    expect(repository.snapshot().xp).toBe(80);
    expect(repository.saveSessionResults).toHaveBeenCalledTimes(2);
  });

  it("gives answer XP but no completion bonus when replaying a done lesson", async () => {
    const itemIds = [...new Set(allExercises.flatMap((e) => e.itemIds))];
    const learned = itemIds.map((id) => review(initialState(id, TODAY), 5, TODAY));
    const repository = createFakeRepository({ states: learned });
    await renderLesson(repository);

    await playCorrectly();

    expect(await screen.findByText("XP ganada: 60")).toBeOnTheScreen();
    // Not due yet: practice keeps every interval.
    expect(repository.snapshot().states).toEqual(learned);
  });

  it("blocks going back while the results are being saved", async () => {
    const repository = createFakeRepository();
    const save = repository.saveSessionResults;
    let finish: () => void = () => {};
    repository.saveSessionResults = (ids, compute) =>
      new Promise((resolve) => {
        finish = () => resolve(save(ids, compute));
      });
    await renderLesson(repository);

    await playCorrectly();

    expect(screen.getByLabelText("Guardando tu progreso")).toBeOnTheScreen();
    expect(mockScreenOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({ gestureEnabled: false, headerBackVisible: false }),
    );

    finish();

    expect(await screen.findByText("¡Lección completada!")).toBeOnTheScreen();
    expect(mockScreenOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({ gestureEnabled: true, headerBackVisible: true }),
    );
  });

  it("lets the learner leave freely before answering anything", async () => {
    await renderLesson(createFakeRepository());

    expect(mockPreventRemove.active).toBe(false);
  });

  it("asks before leaving mid-lesson and stays when the learner cancels", async () => {
    await renderLesson(createFakeRepository());
    await press("despertarse", "radio");
    await check();

    expect(mockPreventRemove.active).toBe(true);
    const repeat = await mockPreventRemove.attemptLeave();

    expect(screen.getByText("¿Salir de la lección?")).toBeOnTheScreen();
    expect(screen.getByText("Perderás las respuestas de esta sesión.")).toBeOnTheScreen();
    await press("Seguir aquí");

    expect(screen.queryByText("¿Salir de la lección?")).toBeNull();
    expect(repeat).not.toHaveBeenCalled();
    expect(screen.getByText("Ejercicio 1 de 6")).toBeOnTheScreen();
  });

  it("leaves mid-lesson when the learner confirms, without saving anything", async () => {
    const repository = createFakeRepository();
    await renderLesson(repository);
    await press("despertarse", "radio");
    await check();

    const repeat = await mockPreventRemove.attemptLeave();
    await press("Salir");

    expect(repeat).toHaveBeenCalledTimes(1);
    expect(mockPreventRemove.active).toBe(false);
    expect(repository.snapshot().states).toEqual([]);
  });

  it("does not ask once the lesson is finished", async () => {
    await renderLesson(createFakeRepository());
    await playCorrectly();
    await screen.findByText("¡Lección completada!");

    expect(mockPreventRemove.active).toBe(false);
  });

  it("handles an unknown lesson id", async () => {
    mockRouter.canDismiss.mockReturnValueOnce(false);
    await renderLesson(createFakeRepository(), "a1.nope.lesson-999");

    expect(screen.getByRole("alert")).toHaveTextContent("No encontramos esta lección.");
    await press("Volver al inicio");

    expect(mockRouter.replace).toHaveBeenCalledWith("/");
  });
});
