import { createCorpus, type Item } from "@english-learn/content";
import {
  initialState,
  localDate,
  review,
  type Clock,
  type AppendedEvents,
} from "@english-learn/domain";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import { AppServicesProvider } from "@/infrastructure/services/app-services";
import {
  createFakeRepository,
  type FakeProgressRepository,
} from "@/testing/fake-progress-repository";
import { createFakeSettingsRepository } from "@/testing/fake-settings-repository";
import { createFakeSoundPlayer, type FakeSoundPlayer } from "@/testing/fake-sound-player";
import { createPreventRemoveMock } from "@/testing/prevent-remove";
import { LessonContainer } from "./lesson-container";
import { STREAK_SOUND_DELAY_MS } from "./use-session-sounds";
import { allExercises, card, lesson, passage, sequenceRng } from "./model/fixtures";
import { testRandomBytes } from "@/testing/random-bytes";

const mockRouter = {
  canDismiss: jest.fn(() => true),
  dismissAll: jest.fn(),
  replace: jest.fn(),
  push: jest.fn(),
};
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
    items: [item("a2.routine.wake-up", "wake up", "despertarse")],
    exercises: allExercises,
    passages: [passage],
    lessons: [lesson],
    cards: [card],
  },
]);

function renderLesson(repository: FakeProgressRepository, lessonId = lesson.id, clock?: Clock) {
  const services = {
    progressRepository: repository,
    clock: clock ?? { today: () => TODAY, nowMs: () => 0 },
    random: sequenceRng([0.3, 0.8, 0.1, 0.6]),
    randomBytes: testRandomBytes,
    deviceId: "test-device",
    settingsRepository: createFakeSettingsRepository(),
    sounds,
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
  await playAfterVocab();
}

/** Answers every fixture exercise after the first (vocab) one correctly. */
async function playAfterVocab() {
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

let sounds: FakeSoundPlayer;
beforeEach(() => {
  jest.clearAllMocks();
  sounds = createFakeSoundPlayer();
});

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
    expect(screen.queryByText(/Plumas/)).not.toBeOnTheScreen();
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

  it("taps when an option is chosen and chimes the verdict with the feedback", async () => {
    await renderLesson(createFakeRepository());

    await press("despertarse", "radio");
    expect(sounds.played).toEqual(["tap"]);
    await check();
    expect(sounds.played).toEqual(["tap", "correct"]);
    await press("Continuar");

    await press("have", "radio");
    await check();
    expect(sounds.played.slice(-1)).toEqual(["correct"]);
    await press("Continuar");

    await press("I");
    await press("usually");
    expect(sounds.played.slice(-2)).toEqual(["tap", "tap"]);
  });

  it("plays the wrong sound after a mistake", async () => {
    await renderLesson(createFakeRepository());

    await press("dormirse", "radio");
    await check();

    expect(sounds.played).toEqual(["tap", "wrong"]);
  });

  it("plays the almost sound for a nearly right translation", async () => {
    await renderLesson(createFakeRepository());
    await press("despertarse", "radio");
    await check();
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
      "I usualy go to bed at eleven",
    );
    await check();

    expect(sounds.played.slice(-1)).toEqual(["almost"]);
  });

  it("celebrates the finished lesson, and the streak when it grew", async () => {
    await renderLesson(createFakeRepository());
    await playCorrectly();
    await screen.findByText("¡Lección completada!");

    expect(sounds.played).toContain("complete");
    await waitFor(() => expect(sounds.played.slice(-2)).toEqual(["complete", "streak"]));
  });

  it("does not play the streak sound when the streak did not grow", async () => {
    await renderLesson(
      createFakeRepository({ streak: { current: 3, longest: 3, lastActiveDate: TODAY } }),
    );
    await playCorrectly();
    await screen.findByText("¡Lección completada!");

    await act(() => new Promise((resolve) => setTimeout(resolve, STREAK_SOUND_DELAY_MS + 100)));
    expect(sounds.played.slice(-1)).toEqual(["complete"]);
    expect(sounds.played).not.toContain("streak");
  });

  it("offers the study card that explains a missed exercise, keeping the lesson where it was", async () => {
    await renderLesson(createFakeRepository());

    await press("dormirse", "radio");
    await check();
    await press("Ver ficha: Phrasal verbs: la rutina");

    expect(mockRouter.push).toHaveBeenCalledWith("/fichas/a2.phrasal-verbs.routine?volver=1");
    // The card opens on top: the lesson is untouched underneath.
    expect(screen.getByRole("alert")).toHaveTextContent(/^Incorrecto/);
    await press("Continuar");
    expect(screen.getByText("Ejercicio 2 de 6")).toBeOnTheScreen();
  });

  it("does not offer a card after a right answer, nor for an exercise no card explains", async () => {
    await renderLesson(createFakeRepository());

    await press("despertarse", "radio");
    await check();
    expect(screen.queryByRole("button", { name: /^Ver ficha/ })).not.toBeOnTheScreen();
    await press("Continuar");

    // The cloze practices "usually", which no card teaches.
    await press("do", "radio");
    await check();
    expect(screen.getByRole("alert")).toHaveTextContent(/^Incorrecto/);
    expect(screen.queryByRole("button", { name: /^Ver ficha/ })).not.toBeOnTheScreen();
  });

  it("shows the correct answer after a mistake", async () => {
    await renderLesson(createFakeRepository());

    await press("dormirse", "radio");
    await check();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Incorrecto. Respuesta correcta: despertarse",
    );
    await press("Continuar");
    expect(screen.getByText("Ejercicio 2 de 6")).toBeOnTheScreen();
  });

  it("lets the learner mark a wrong translation as correct, and saves it as disputed", async () => {
    const repository = createFakeRepository();
    await renderLesson(repository);
    await press("despertarse", "radio");
    await check();
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
      "I go to sleep at eleven",
    );
    await check();
    expect(screen.getByRole("alert")).toHaveTextContent(/^Incorrecto/);

    await press("Mi respuesta también es correcta");

    expect(screen.getByRole("alert")).toHaveTextContent("Marcada como correcta");
    expect(
      screen.queryByRole("button", { name: "Mi respuesta también es correcta" }),
    ).not.toBeOnTheScreen();
    await press("Continuar");
    expect(await screen.findByText("Aciertos: 6 de 6")).toBeOnTheScreen();

    const events = repository.events();
    expect(events.filter((e) => e.type === "answer_disputed").map((e) => e.payload)).toEqual([
      {
        v: 1,
        exerciseId: "a2.routine.write-001",
        itemIds: ["a2.routine.usually", "a2.routine.go-to-bed"],
        answer: "I go to sleep at eleven",
        accepted: false,
      },
    ]);
    const goToBed = events.find(
      (e) => e.type === "item_reviewed" && e.payload.itemId === "a2.routine.go-to-bed",
    );
    expect(goToBed?.payload).toMatchObject({ grade: 4 });
  });

  it("lists what was missed on the summary, and only that", async () => {
    await renderLesson(createFakeRepository());

    await press("dormirse", "radio");
    await check();
    await press("Continuar");
    await playAfterVocab();

    expect(await screen.findByText("¡Lección completada!")).toBeOnTheScreen();
    expect(screen.getByRole("header", { name: "Para repasar" })).toBeOnTheScreen();
    const missed = screen.getByTestId("summary-to-review");
    expect(within(missed).getByText("wake up")).toBeOnTheScreen();
    expect(within(missed).getByText("despertarse")).toBeOnTheScreen();
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

  it("recaps the lesson's new items after the summary and opens the card that teaches one", async () => {
    await renderLesson(createFakeRepository());
    await playCorrectly();

    const recap = await screen.findByTestId("summary-recap");
    expect(within(recap).getByText("despertarse")).toBeOnTheScreen();
    await fireEvent.press(
      within(recap).getByRole("button", { name: "Ver ficha: Phrasal verbs: la rutina" }),
    );

    expect(mockRouter.push).toHaveBeenCalledWith("/fichas/a2.phrasal-verbs.routine");
  });

  it("repeats the lesson from its summary; the redo pays answer XP but no second bonus", async () => {
    const repository = createFakeRepository();
    await renderLesson(repository);
    await press("dormirse", "radio");
    await check();
    await press("Continuar");
    await playAfterVocab();
    // 5 right × 10 + the first-completion bonus (5/6 ≥ 80 %).
    expect(await screen.findByText("XP ganada: 70")).toBeOnTheScreen();

    await press("Repetir lección");
    expect(screen.getByText("Ejercicio 1 de 6")).toBeOnTheScreen();
    await playCorrectly();

    expect(await screen.findByText("XP ganada: 60")).toBeOnTheScreen();
    expect(screen.getByText("Aciertos: 6 de 6")).toBeOnTheScreen();
    expect(repository.snapshot().xp).toBe(130);
    expect(await repository.getLessonResults()).toEqual([
      { lessonId: lesson.id, bestAccuracy: 1, completions: 2 },
    ]);
  });

  it("returns home after the summary", async () => {
    await renderLesson(createFakeRepository());
    await playCorrectly();

    await fireEvent.press(await screen.findByRole("button", { name: "Volver al inicio" }));

    expect(mockRouter.dismissAll).toHaveBeenCalledTimes(1);
  });

  it("explains a failed save and saves on retry without duplicating anything", async () => {
    const repository = createFakeRepository();
    const save = repository.appendEvents;
    repository.appendEvents = jest
      .fn<Promise<AppendedEvents>, Parameters<typeof save>>()
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
    expect(repository.appendEvents).toHaveBeenCalledTimes(2);
    // The failed attempt wrote nothing: one session in the log.
    expect(repository.events().filter((e) => e.type === "session_completed")).toHaveLength(1);
  });

  it("gives answer XP but no completion bonus when replaying a completed lesson", async () => {
    const itemIds = [...new Set(allExercises.flatMap((e) => e.itemIds))];
    const learned = itemIds.map((id) => review(initialState(id, TODAY), 5, TODAY));
    // Completed before the event log: the upgrade baseline lists it.
    const repository = createFakeRepository({ states: learned, completedLessonIds: [lesson.id] });
    await renderLesson(repository);

    await playCorrectly();

    expect(await screen.findByText("XP ganada: 60")).toBeOnTheScreen();
    // Not due yet: practice keeps every interval.
    expect(repository.snapshot().states).toEqual(
      [...learned].sort((a, b) => a.itemId.localeCompare(b.itemId)),
    );
  });

  it("blocks going back while the results are being saved", async () => {
    const repository = createFakeRepository();
    const save = repository.appendEvents;
    let finish: () => void = () => {};
    repository.appendEvents = (events) =>
      new Promise((resolve) => {
        finish = () => resolve(save(events));
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

  it("caps the review of an item whose word was looked up before an exercise practicing it", async () => {
    const withGlossary = createCorpus([
      {
        items: [
          item("a2.routine.wake-up", "wake up", "despertarse"),
          item("a2.routine.usually", "usually", "normalmente"),
        ],
        exercises: allExercises,
        passages: [passage],
        lessons: [lesson],
        glossary: [
          {
            id: "glossary.wake-up",
            headword: "wake up",
            kind: "phrase",
            forms: ["wake up"],
            senses: [{ es: "despertarse", pos: "phrasal verb" }],
          },
        ],
      },
    ]);
    const repository = createFakeRepository();
    await render(
      <AppServicesProvider
        services={{
          progressRepository: repository,
          clock: { today: () => TODAY, nowMs: () => 0 },
          random: sequenceRng([0.3, 0.8, 0.1, 0.6]),
          randomBytes: testRandomBytes,
          deviceId: "test-device",
          settingsRepository: createFakeSettingsRepository(),
          sounds,
        }}
      >
        <LessonContainer lessonId={lesson.id} content={withGlossary} />
      </AppServicesProvider>,
    );

    // The evaluated term is locked until the answer is checked.
    expect(screen.queryByRole("button", { name: "wake up, ver traducción" })).toBeNull();
    await press("despertarse", "radio");
    await check();
    // Unlocked in the feedback: looking it up now counts for the exercises still to come.
    await press("wake up, ver traducción");
    expect(screen.getByText("phrasal verb")).toBeOnTheScreen();
    await press("Cerrar");
    await press("Continuar");
    await playAfterVocab();

    await screen.findByText("¡Lección completada!");
    const states = new Map(repository.snapshot().states.map((s) => [s.itemId, s]));
    // Word order (after the lookup) practiced wake up: capped at 3 although every answer was right.
    expect(states.get("a2.routine.wake-up")).toEqual(
      review(initialState("a2.routine.wake-up", TODAY), 3, TODAY),
    );
    expect(states.get("a2.routine.usually")).toEqual(
      review(initialState("a2.routine.usually", TODAY), 5, TODAY),
    );
  });
});
