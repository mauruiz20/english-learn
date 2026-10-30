import { createCorpus } from "@english-learn/content";
import { localDate, type Clock } from "@english-learn/domain";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { AppServicesProvider } from "@/infrastructure/services/app-services";
import {
  createFakeRepository,
  type FakeProgressRepository,
} from "@/testing/fake-progress-repository";
import { LessonContainer } from "./lesson-container";
import { allExercises, lesson, passage, sequenceRng } from "./model/fixtures";

const mockRouter = { canDismiss: jest.fn(() => true), dismissAll: jest.fn(), replace: jest.fn() };
jest.mock("expo-router", () => ({ useRouter: () => mockRouter }));

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

  it("explains when progress cannot be saved", async () => {
    const repository = createFakeRepository();
    repository.saveStreak = () => Promise.reject(new Error("disk I/O error"));
    jest.spyOn(console, "error").mockImplementation(() => {});
    await renderLesson(repository);

    await playCorrectly();

    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos guardar tu progreso.");
  });

  it("handles an unknown lesson id", async () => {
    mockRouter.canDismiss.mockReturnValueOnce(false);
    await renderLesson(createFakeRepository(), "a1.nope.lesson-999");

    expect(screen.getByRole("alert")).toHaveTextContent("No encontramos esta lección.");
    await press("Volver al inicio");

    expect(mockRouter.replace).toHaveBeenCalledWith("/");
  });
});
