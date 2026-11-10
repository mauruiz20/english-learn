import {
  createCorpus,
  type Corpus,
  type LevelIntro,
  type VocabExercise,
} from "@english-learn/content";
import {
  initialState,
  localDate,
  review,
  type Clock,
  type LocalDate,
  type ProgressRepository,
  type SessionCompletedEvent,
  type ReviewState,
  type SettingsRepository,
} from "@english-learn/domain";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type React from "react";
import { allExercises, card, lesson, passage, vocab } from "@/features/lesson/model/fixtures";
import { AppServicesProvider } from "@/infrastructure/services/app-services";
import { createFakeRepository } from "@/testing/fake-progress-repository";
import { createFakeSettingsRepository } from "@/testing/fake-settings-repository";
import { createFakeSoundPlayer } from "@/testing/fake-sound-player";
import { SoundPreferenceProvider } from "@/features/sound/sound-preference";
import { ThemePreferenceProvider } from "@/features/theme/theme-preference";
import { completeSession } from "@/features/lesson/application/complete-session";
import { ACHIEVEMENTS } from "@/features/achievements/model/achievements";
import { HomeContainer } from "./home-container";
import { OriginMoveOfferContext, type OriginMoveOffer } from "@/features/transfer/origin-move-gate";
import { AccountContext, type AccountContextValue } from "@/features/account/account-context";
import { createCompletionMemory, type CompletionMemory } from "./model/completion-memory";
import { NO_NEWS, createHomeAviMemory, type HomeAviMemory } from "./model/home-avi";
import { withMotion } from "@/testing/motion";
import { StyleSheet } from "react-native";
import { testRandomBytes } from "@/testing/random-bytes";
import { corpus } from "@english-learn/content/corpus";
import { lessonItemIds } from "@/features/lesson/model/lesson-catalog";
import {
  hasDeferredReviewExercises,
  planReview,
  reviewOutlook,
} from "@/features/review/model/review-plan";

const mockPush = jest.fn();

jest.mock("expo-router", () => {
  const { useEffect } = jest.requireActual<typeof React>("react");
  return {
    useRouter: () => ({ push: mockPush }),
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
  };
});

const TODAY = localDate("2026-10-29");

/** States due on `TODAY` for the first `n` reviewable items of the bundled lessons. */
function realCorpusDueStates(n: number): ReviewState[] {
  const yesterday = localDate("2026-10-28");
  const ids = new Set<string>();
  for (const l of corpus.lessons) {
    for (const id of lessonItemIds(l, corpus.exercisesById)) {
      const reviewable = corpus.exercises.some(
        (e) => e.type !== "reading" && e.itemIds.includes(id),
      );
      if (ids.size < n && reviewable) ids.add(id);
    }
  }
  return [...ids].map((id) => review(initialState(id, yesterday), 5, yesterday));
}
const fixedClock: Clock = { today: () => TODAY, nowMs: () => 0 };

let sessionSeq = 0;
/** A review saved on `day` with `exercises` answered (only the daily goal reads them). */
function sessionOn(day: LocalDate, exercises: number): SessionCompletedEvent {
  sessionSeq += 1;
  const id = `0190000-goal-${sessionSeq}`;
  return {
    id,
    deviceId: "test-device",
    occurredAt: sessionSeq,
    localDate: day,
    type: "session_completed",
    payload: { v: 1, sessionId: id, kind: "review", answerXp: 0, accuracy: 1, exercises },
  };
}

const b1Lesson = {
  ...lesson,
  id: "b1.routine.lesson-001",
  level: "B1",
  title: "Rutina B1",
} as const;
const content = createCorpus([
  { exercises: allExercises, passages: [passage], lessons: [lesson, b1Lesson], cards: [card] },
]);
/** Only the A2 lesson: finishing it keeps the path on A2 (there is no level to move on to). */
const a2Content = createCorpus([
  { exercises: allExercises, passages: [passage], lessons: [lesson], cards: [card] },
]);
/** A2, then a B1 lesson with an item of its own, so finishing A2 leaves B1 to do. */
const b1Vocab: VocabExercise = {
  ...vocab,
  id: "b1.routine.vocab-001",
  level: "B1",
  itemIds: ["b1.routine.x"],
};
const pathContent = createCorpus([
  {
    exercises: [...allExercises, b1Vocab],
    passages: [passage],
    lessons: [lesson, { ...b1Lesson, exerciseIds: [b1Vocab.id] }],
  },
]);
const a2ItemIds = [...new Set(allExercises.flatMap((e) => e.itemIds))];

function renderContainer(
  repository: ProgressRepository,
  completionMemory: CompletionMemory = createCompletionMemory(),
  settings: SettingsRepository = createFakeSettingsRepository(),
  homeContent: Corpus = content,
  aviMemory: HomeAviMemory = createHomeAviMemory(),
) {
  return render(
    renderContainerElement(repository, completionMemory, settings, homeContent, aviMemory),
  );
}

function renderContainerElement(
  repository: ProgressRepository,
  completionMemory: CompletionMemory = createCompletionMemory(),
  settings: SettingsRepository = createFakeSettingsRepository(),
  homeContent: Corpus = content,
  aviMemory: HomeAviMemory = createHomeAviMemory(),
) {
  return (
    <AppServicesProvider
      services={{
        progressRepository: repository,
        clock: fixedClock,
        random: () => 0,
        randomBytes: testRandomBytes,
        deviceId: "test-device",
        settingsRepository: settings,
        sounds: createFakeSoundPlayer(),
      }}
    >
      <SoundPreferenceProvider>
        <ThemePreferenceProvider>
          <HomeContainer
            content={homeContent}
            completionMemory={completionMemory}
            aviMemory={aviMemory}
          />
        </ThemePreferenceProvider>
      </SoundPreferenceProvider>
    </AppServicesProvider>
  );
}

beforeEach(() => jest.clearAllMocks());

describe("HomeContainer", () => {
  it("keeps the A1 checkpoint entry available from the home path", async () => {
    await renderContainer(
      createFakeRepository({ placement: { level: "A1", theta: -2 } }),
      undefined,
      undefined,
      corpus,
    );

    expect(await screen.findByText("Comprobación de presentaciones")).toBeOnTheScreen();
    expect(
      screen.getByRole("button", { name: "Abrir la lección «¿Cómo te llamas?»" }),
    ).toBeOnTheScreen();
  });

  it("shows the move banner on the old web address, wired to the offer", async () => {
    const offer: OriginMoveOffer = {
      newOrigin: "https://english.maumar.com.ar",
      status: { kind: "idle" },
      take: jest.fn(),
      skip: jest.fn(),
    };
    await render(
      <OriginMoveOfferContext value={offer}>
        {renderContainerElement(createFakeRepository())}
      </OriginMoveOfferContext>,
    );

    expect(await screen.findByText("La app se mudó a english.maumar.com.ar")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Llevar mi progreso" }));
    expect(offer.take).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole("button", { name: "Ir sin mi progreso" }));
    expect(offer.skip).toHaveBeenCalledTimes(1);
  });

  it("shows no plumas balance nor note, even for study done before the event log", async () => {
    await renderContainer(createFakeRepository({ xp: 120, completedLessonIds: ["l1", "l2"] }));

    expect(await screen.findByLabelText("Racha: 0 días")).toBeOnTheScreen();
    expect(screen.queryByText(/plumas/i)).toBeNull();
    expect(screen.queryByLabelText(/plumas/i)).toBeNull();
  });

  it("shows no move banner anywhere else", async () => {
    await renderContainer(createFakeRepository());

    expect(await screen.findByLabelText("Racha: 0 días")).toBeOnTheScreen();
    expect(screen.queryByText(/La app se mudó/)).toBeNull();
  });

  it("renders the empty progress of a new learner", async () => {
    await renderContainer(createFakeRepository());

    expect(await screen.findByLabelText("Racha: 0 días")).toBeOnTheScreen();
    expect(screen.getByText("0 XP")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Hacer test de nivel" })).toBeOnTheScreen();
  });

  it("renders stored progress", async () => {
    await renderContainer(
      createFakeRepository({
        streak: { current: 4, longest: 9, lastActiveDate: localDate("2026-10-28") },
        xp: 250,
        placement: { level: "B2", theta: 1.2 },
      }),
    );

    expect(await screen.findByLabelText("Racha: 4 días")).toBeOnTheScreen();
    expect(screen.getByText("250 XP")).toBeOnTheScreen();
    expect(screen.getByText("Tu nivel: B2")).toBeOnTheScreen();
  });

  it("shows a broken streak as zero days", async () => {
    await renderContainer(
      createFakeRepository({
        streak: { current: 7, longest: 7, lastActiveDate: localDate("2026-10-20") },
      }),
    );

    expect(await screen.findByLabelText("Racha: 0 días")).toBeOnTheScreen();
  });

  it("shows an error when the repository fails", async () => {
    const repository = createFakeRepository();
    repository.getXp = () => Promise.reject(new Error("disk I/O error"));

    await renderContainer(repository);

    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos cargar tu progreso.");
  });

  it("navigates to the placement test", async () => {
    await renderContainer(createFakeRepository());

    await fireEvent.press(await screen.findByRole("button", { name: "Hacer test de nivel" }));

    expect(mockPush).toHaveBeenCalledWith("/placement");
  });

  it("lists A2 lessons when the learner has no level yet", async () => {
    await renderContainer(createFakeRepository());

    expect(await screen.findByText("Lecciones de nivel A2")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Mi rutina" })).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Rutina B1" })).not.toBeOnTheScreen();
  });

  it("lists the lessons of the placement level", async () => {
    await renderContainer(createFakeRepository({ placement: { level: "B1", theta: 0.2 } }));

    expect(await screen.findByText("Lecciones de nivel B1")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Rutina B1" })).toBeOnTheScreen();
  });

  it("lists the nearest lower level's lessons for a level without lessons", async () => {
    await renderContainer(createFakeRepository({ placement: { level: "C1", theta: 2 } }));

    expect(await screen.findByText("Lecciones de nivel B1")).toBeOnTheScreen();
    expect(screen.getByText("Tu nivel: C1")).toBeOnTheScreen();
  });

  it("moves on to the next level's lessons once every lesson of the level is done", async () => {
    await renderContainer(
      createFakeRepository({
        placement: { level: "A2", theta: -1 },
        states: a2ItemIds.map((id) => initialState(id, TODAY)),
      }),
      undefined,
      undefined,
      pathContent,
    );

    expect(await screen.findByText("Lecciones de nivel B1")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Rutina B1" })).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: /^Mi rutina/ })).not.toBeOnTheScreen();
    expect(screen.getByText("Tu nivel: A2")).toBeOnTheScreen();
  });

  describe("path level", () => {
    // A2, two B1 lessons and a B2 one, each with items of its own.
    const own = (level: "B1" | "B2", n: number): VocabExercise => ({
      ...vocab,
      id: `${level.toLowerCase()}.work.vocab-00${n}`,
      level,
      itemIds: [`${level.toLowerCase()}.work.item-${n}`],
    });
    const exercises = [own("B1", 1), own("B1", 2), own("B2", 3)];
    const levelsContent = createCorpus([
      {
        exercises: [...allExercises, ...exercises],
        passages: [passage],
        lessons: [
          lesson,
          ...exercises.map((e, i) => ({
            ...lesson,
            id: `${e.level.toLowerCase()}.work.lesson-00${i + 1}`,
            level: e.level,
            topic: "work",
            title: `Trabajo ${e.level} ${i + 1}`,
            exerciseIds: [e.id],
          })),
        ],
      },
    ]);
    // Placed at C1 with the first B1 lesson done: the owner's state once B2 shipped.
    const placedHighWithB1Started = () =>
      createFakeRepository({
        placement: { level: "C1", theta: 2 },
        states: [initialState("b1.work.item-1", TODAY)],
      });
    const checkWidth = async (lessonId: string) => {
      const check = await screen.findByTestId(`check-${lessonId}`, {
        includeHiddenElements: true,
      });
      const clip = check.children[0] as unknown as { props: { style: unknown } };
      return StyleSheet.flatten(clip.props.style as never)?.width;
    };

    it("stays on a B1 the learner started, even placed above it", async () => {
      await renderContainer(placedHighWithB1Started(), undefined, undefined, levelsContent);

      expect(await screen.findByText("Lecciones de nivel B1")).toBeOnTheScreen();
      expect(
        screen.getByRole("button", { name: "Nivel del recorrido: B1, automático" }),
      ).toBeOnTheScreen();
      expect(screen.getByRole("button", { name: /^Trabajo B1 2/ }).props.accessibilityHint).toBe(
        "Tu siguiente lección",
      );
    });

    it("shows a level picked by hand, remembers it, and goes back to automatic", async () => {
      withMotion();
      const settings = createFakeSettingsRepository();
      const repository = placedHighWithB1Started();
      const memory = createCompletionMemory();
      await renderContainer(repository, memory, settings, levelsContent);

      await fireEvent.press(await screen.findByRole("button", { name: /^Nivel del recorrido/ }));
      await fireEvent.press(screen.getByRole("radio", { name: "B2, 0 % completado" }));

      expect(await screen.findByText("Lecciones de nivel B2")).toBeOnTheScreen();
      expect(settings.pathLevel()).toBe("B2");
      // The next lesson, "Siguiente" and Avi follow the level shown.
      expect(screen.getByRole("button", { name: /^Trabajo B2/ }).props.accessibilityHint).toBe(
        "Tu siguiente lección",
      );
      expect(screen.queryByRole("button", { name: /^Trabajo B1/ })).not.toBeOnTheScreen();

      await fireEvent.press(screen.getByRole("button", { name: /^Nivel del recorrido/ }));
      await fireEvent.press(screen.getByRole("radio", { name: "B1, 50 % completado" }));
      expect(
        await screen.findByRole("button", { name: "Nivel del recorrido: B1, elegido a mano" }),
      ).toBeOnTheScreen();
      // Coming back to B1 is not a lesson just completed: its check is not drawn again.
      expect(await checkWidth("b1.work.lesson-001")).not.toBe(0);

      await renderContainer(repository, memory, settings, levelsContent);
      expect(
        await screen.findByRole("button", { name: "Nivel del recorrido: B1, elegido a mano" }),
      ).toBeOnTheScreen();

      await fireEvent.press(screen.getByRole("button", { name: /^Nivel del recorrido/ }));
      await fireEvent.press(screen.getByRole("radio", { name: "Automático, ahora B1" }));
      expect(
        await screen.findByRole("button", { name: "Nivel del recorrido: B1, automático" }),
      ).toBeOnTheScreen();
      expect(settings.pathLevel()).toBeNull();
    });

    // A1 and C1 lessons, each with an item of its own, around the A2 to B2 ones.
    const ends = (level: "A1" | "C1") => {
      const exercise: VocabExercise = {
        ...vocab,
        id: `${level.toLowerCase()}.work.vocab-001`,
        level,
        itemIds: [`${level.toLowerCase()}.work.item-1`],
      };
      const endLesson = {
        ...lesson,
        id: `${level.toLowerCase()}.work.lesson-001`,
        level,
        topic: "work",
        title: `Trabajo ${level}`,
        exerciseIds: [exercise.id],
      };
      return { exercises: [exercise], lessons: [endLesson] };
    };
    const withEnds = (...levels: ("A1" | "C1")[]) =>
      createCorpus([
        {
          exercises: [...levelsContent.exercises, ...levels.flatMap((l) => ends(l).exercises)],
          passages: [...levelsContent.passages],
          lessons: [...levels.flatMap((l) => ends(l).lessons), ...levelsContent.lessons],
        },
      ]);
    const pickerLevels = () =>
      screen.getAllByRole("radio").map((radio) => radio.props.accessibilityLabel as string);

    it("starts a learner placed at A1 on A1, and lists only the levels with lessons", async () => {
      await renderContainer(
        createFakeRepository({ placement: { level: "A1", theta: -2 } }),
        undefined,
        undefined,
        withEnds("A1"),
      );

      expect(await screen.findByText("Lecciones de nivel A1")).toBeOnTheScreen();
      expect(screen.getByRole("button", { name: /^Trabajo A1/ }).props.accessibilityHint).toBe(
        "Tu siguiente lección",
      );
      await fireEvent.press(screen.getByRole("button", { name: /^Nivel del recorrido/ }));
      expect(pickerLevels()).toEqual([
        "Automático, ahora A1",
        "A1, 0 % completado",
        "A2, 0 % completado",
        "B1, 0 % completado",
        "B2, 0 % completado",
      ]);
    });

    it("starts a learner placed at C1 on C1 once C1 has lessons, and lists it", async () => {
      await renderContainer(
        createFakeRepository({ placement: { level: "C1", theta: 2 } }),
        undefined,
        undefined,
        withEnds("A1", "C1"),
      );

      expect(await screen.findByText("Lecciones de nivel C1")).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole("button", { name: /^Nivel del recorrido/ }));
      expect(pickerLevels()).toEqual([
        "Automático, ahora C1",
        "A1, 0 % completado",
        "A2, 0 % completado",
        "B1, 0 % completado",
        "B2, 0 % completado",
        "C1, 0 % completado",
      ]);
    });

    it("keeps a learner placed at C1 on B2 while C1 has no lessons", async () => {
      await renderContainer(
        createFakeRepository({ placement: { level: "C1", theta: 2 } }),
        undefined,
        undefined,
        withEnds("A1"),
      );

      expect(await screen.findByText("Lecciones de nivel B2")).toBeOnTheScreen();
    });

    it("keeps a level picked by hand once every lesson of it is done", async () => {
      await renderContainer(
        createFakeRepository({
          placement: { level: "A2", theta: -1 },
          states: a2ItemIds.map((id) => initialState(id, TODAY)),
        }),
        undefined,
        createFakeSettingsRepository({ pathLevel: "A2" }),
        levelsContent,
      );

      expect(await screen.findByText("Lecciones de nivel A2")).toBeOnTheScreen();
      expect(screen.getByRole("button", { name: "Mi rutina, completada" })).toBeOnTheScreen();
    });
  });

  it("marks a lesson as done once all its items have review states", async () => {
    await renderContainer(
      createFakeRepository({ states: a2ItemIds.map((id) => initialState(id, TODAY)) }),
      undefined,
      undefined,
      a2Content,
    );

    expect(await screen.findByRole("button", { name: "Mi rutina, completada" })).toBeOnTheScreen();
  });

  it("shows each lesson's best result: the redo that got everything right counts", async () => {
    const repository = createFakeRepository();
    const itemIds = [...new Set(allExercises.flatMap((e) => e.itemIds))];
    const save = (accuracy: number) =>
      completeSession({
        repository,
        today: TODAY,
        nowMs: 0,
        randomBytes: testRandomBytes,
        deviceId: "test-device",
        kind: "lesson",
        summary: {
          lessonId: lesson.id,
          verdicts: [],
          accuracy,
          answerXp: 0,
          itemOutcomes: itemIds.map((itemId) => ({
            itemId,
            exerciseType: "vocab",
            verdict: "correct",
            responseMs: 1000,
          })),
        },
      });
    await save(4 / 6);
    const first = await renderContainer(repository, undefined, undefined, a2Content);
    expect(
      await screen.findByRole("button", {
        name: "Mi rutina, completada con errores: 4 de 6 correctas",
      }),
    ).toBeOnTheScreen();
    await first.unmount();

    await save(1);
    await save(5 / 6);
    await renderContainer(repository, undefined, undefined, a2Content);
    expect(
      await screen.findByRole("button", {
        name: "Mi rutina, completada sin errores: 6 de 6 correctas",
      }),
    ).toBeOnTheScreen();
  });

  it("draws the check of a lesson completed since home was last seen", async () => {
    withMotion();
    const memory = createCompletionMemory();
    memory.take([]); // Home was seen earlier in the session, with nothing done.
    await renderContainer(
      createFakeRepository({ states: a2ItemIds.map((id) => initialState(id, TODAY)) }),
      memory,
      undefined,
      a2Content,
    );

    const check = await screen.findByTestId(`check-${lesson.id}`, { includeHiddenElements: true });
    const clip = check.children[0] as unknown as { props: { style: unknown } };
    // Not drawn yet: it is about to be drawn, once.
    expect(StyleSheet.flatten(clip.props.style as never)?.width).toBe(0);
    expect([...memory.take([lesson.id])]).toEqual([]);
  });

  it("counts the album stickers won and opens the album", async () => {
    await renderContainer(createFakeRepository({ xp: 150 }));

    await fireEvent.press(
      await screen.findByRole("button", { name: /^Mi álbum: 1 de \d+ insignias$/ }),
    );
    expect(mockPush).toHaveBeenCalledWith("/album");
  });

  it("counts out of the stickers the album shows: no sticker for a level without lessons", async () => {
    // A2 and B1 lessons only: the A1, B2 and C1 level stickers are not in the album.
    const shown = ACHIEVEMENTS.length - 3;
    await renderContainer(createFakeRepository({ xp: 150 }));

    expect(
      await screen.findByRole("button", { name: `Mi álbum: 1 de ${shown} insignias` }),
    ).toBeOnTheScreen();
  });

  it("counts the study cards studied and opens them", async () => {
    await renderContainer(
      createFakeRepository({ states: card.itemIds.map((id) => initialState(id, TODAY)) }),
    );

    await fireEvent.press(
      await screen.findByRole("button", { name: "Fichas: 1 ficha, 1 estudiada" }),
    );
    expect(mockPush).toHaveBeenCalledWith("/fichas");
  });

  it("opens Tu progreso", async () => {
    await renderContainer(createFakeRepository());

    await fireEvent.press(
      await screen.findByRole("button", {
        name: "Tu progreso: dominadas, en proceso y difíciles",
      }),
    );
    expect(mockPush).toHaveBeenCalledWith("/progreso");
  });

  describe("deepen steps", () => {
    const linkedContent = createCorpus([
      {
        exercises: allExercises,
        passages: [passage],
        lessons: [{ ...lesson, deepenCardIds: [card.id] }],
        cards: [card],
      },
    ]);
    const lessonItemIds = [
      ...new Set(
        lesson.exerciseIds.flatMap((id) => linkedContent.exercisesById.get(id)?.itemIds ?? []),
      ),
    ];

    function renderLinked(repository: ProgressRepository) {
      return render(
        <AppServicesProvider
          services={{
            progressRepository: repository,
            clock: fixedClock,
            random: () => 0,
            randomBytes: testRandomBytes,
            deviceId: "test-device",
            settingsRepository: createFakeSettingsRepository(),
            sounds: createFakeSoundPlayer(),
          }}
        >
          <SoundPreferenceProvider>
            <ThemePreferenceProvider>
              <HomeContainer content={linkedContent} completionMemory={createCompletionMemory()} />
            </ThemePreferenceProvider>
          </SoundPreferenceProvider>
        </AppServicesProvider>,
      );
    }

    it("shows no step under a lesson not done yet", async () => {
      await renderLinked(createFakeRepository());

      expect(await screen.findByRole("button", { name: "Mi rutina" })).toBeOnTheScreen();
      expect(screen.queryByRole("button", { name: /^Profundiza: / })).not.toBeOnTheScreen();
    });

    it("offers the linked card under the done lesson, new until practiced, and opens it", async () => {
      await renderLinked(
        createFakeRepository({ states: lessonItemIds.map((id) => initialState(id, TODAY)) }),
      );

      const step = await screen.findByRole("button", {
        name: `Profundiza: ${card.title}, ficha nueva`,
      });
      await fireEvent.press(step);
      expect(mockPush).toHaveBeenCalledWith(`/fichas/${encodeURIComponent(card.id)}`);
    });

    it("shows the card's best practice result", async () => {
      const repository = createFakeRepository({
        states: lessonItemIds.map((id) => initialState(id, TODAY)),
      });
      await completeSession({
        repository,
        today: TODAY,
        nowMs: 0,
        randomBytes: testRandomBytes,
        deviceId: "test-device",
        kind: "lesson",
        summary: {
          lessonId: card.id,
          verdicts: [],
          accuracy: 1,
          answerXp: 0,
          itemOutcomes: card.itemIds.map((itemId) => ({
            itemId,
            exerciseType: "vocab",
            verdict: "correct",
            responseMs: 1000,
          })),
        },
      });
      await renderLinked(repository);

      expect(
        await screen.findByRole("button", {
          name: `Profundiza: ${card.title}, completada sin errores: 2 de 2 correctas`,
        }),
      ).toBeOnTheScreen();
    });
  });

  it("counts the items due for review", async () => {
    const yesterday = localDate("2026-10-28");
    const learned = (id: string) => review(initialState(id, yesterday), 5, yesterday);
    await renderContainer(
      createFakeRepository({
        // Due: wake-up and breakfast. Commute only has a reading exercise: not reviewable.
        states: [
          learned("a2.routine.wake-up"),
          learned("a2.routine.breakfast"),
          learned("a2.routine.commute"),
          review(initialState("a2.routine.usually", TODAY), 5, TODAY),
        ],
      }),
    );

    expect(await screen.findByText("2 pendientes")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Repasar" }));
    expect(mockPush).toHaveBeenCalledWith("/review");
  });

  it.each([5, 20, 45])(
    "with %i due items, counts exactly the exercises the next review serves",
    async (n) => {
      const states = realCorpusDueStates(n);
      const input = { states, today: TODAY, exercises: corpus.exercises };
      const { next, later } = reviewOutlook(input);
      expect(next).toBe(planReview(input).exercises.length);

      await renderContainer(createFakeRepository({ states }), undefined, undefined, corpus);

      expect(await screen.findByText(`${next} pendientes`)).toBeOnTheScreen();
      if (later > 0) expect(screen.getByText(`y ${later} más después`)).toBeOnTheScreen();
      else expect(screen.queryByText(/más después/)).not.toBeOnTheScreen();
      if (hasDeferredReviewExercises(input)) {
        expect(screen.getByText("El resto queda para mañana.")).toBeOnTheScreen();
      }
    },
  );

  it("opens a lesson", async () => {
    await renderContainer(createFakeRepository());

    await fireEvent.press(await screen.findByRole("button", { name: "Mi rutina" }));

    expect(mockPush).toHaveBeenCalledWith("/lesson/a2.routine.lesson-001");
  });

  it("opens the account page", async () => {
    await renderContainer(createFakeRepository());

    await fireEvent.press(await screen.findByRole("link", { name: "Cuenta" }));

    expect(mockPush).toHaveBeenCalledWith("/cuenta");
  });

  describe("greeting", () => {
    const signedIn = (account: AccountContextValue["session"]): AccountContextValue => ({
      availability: "available",
      session: account,
      syncStatus: { kind: "idle" },
      progressVersion: 0,
      actions: null,
    });

    it("says hello by the signed-in learner's first name", async () => {
      await render(
        <AccountContext
          value={signedIn({
            status: "signed-in",
            account: { userId: "u1", email: "ines@example.com", givenName: "Inés" },
          })}
        >
          {renderContainerElement(createFakeRepository())}
        </AccountContext>,
      );

      expect(await screen.findByRole("header", { name: "Hola, Inés" })).toBeOnTheScreen();
    });

    it("says a plain hello when signed in from before names were remembered", async () => {
      await render(
        <AccountContext
          value={signedIn({
            status: "signed-in",
            account: { userId: "u1", email: "ines@example.com" },
          })}
        >
          {renderContainerElement(createFakeRepository())}
        </AccountContext>,
      );

      expect(await screen.findByRole("header", { name: "¡Hola!" })).toBeOnTheScreen();
    });

    it("says a plain hello when signed out", async () => {
      await renderContainer(createFakeRepository());

      expect(await screen.findByRole("header", { name: "¡Hola!" })).toBeOnTheScreen();
    });
  });

  it("reloads progress after a sync brought progress from another device", async () => {
    const repository = createFakeRepository();
    const account = (progressVersion: number): AccountContextValue => ({
      availability: "available",
      session: { status: "signed-in", account: { userId: "u1", email: "ana@example.com" } },
      syncStatus: { kind: "idle" },
      progressVersion,
      actions: null,
    });
    const tree = (version: number) => (
      <AccountContext value={account(version)}>
        <AppServicesProvider
          services={{
            progressRepository: repository,
            clock: fixedClock,
            random: () => 0,
            randomBytes: testRandomBytes,
            deviceId: "test-device",
            settingsRepository: createFakeSettingsRepository(),
            sounds: createFakeSoundPlayer(),
          }}
        >
          <SoundPreferenceProvider>
            <ThemePreferenceProvider>
              <HomeContainer content={content} />
            </ThemePreferenceProvider>
          </SoundPreferenceProvider>
        </AppServicesProvider>
      </AccountContext>
    );
    const view = await render(tree(0));
    expect(await screen.findByText("0 XP")).toBeOnTheScreen();

    // Another device's events arrived through sync.
    await repository.appendEvents([
      {
        id: "0190000a-0000-7000-8000-000000000001",
        deviceId: "other-device",
        occurredAt: 1,
        localDate: TODAY,
        type: "session_completed",
        payload: {
          v: 1,
          sessionId: "s1",
          kind: "lesson",
          lessonId: lesson.id,
          answerXp: 40,
          accuracy: 1,
        },
      },
    ]);
    await view.rerender(tree(1));

    expect(await screen.findByText(/^[1-9]\d* XP$/)).toBeOnTheScreen();
  });
  describe("daily goal", () => {
    const answered = (...sessions: [LocalDate, number][]) =>
      createFakeRepository({ events: sessions.map(([day, n]) => sessionOn(day, n)) });

    it("counts today's exercises against the goal, never yesterday's", async () => {
      await renderContainer(
        answered([localDate("2026-10-28"), 30], [TODAY, 5], [TODAY, 7]),
        undefined,
        createFakeSettingsRepository({ dailyGoalPromptDismissed: true }),
      );

      expect(
        await screen.findByRole("progressbar", { name: "Meta diaria: 12 de 20 ejercicios hoy" }),
      ).toBeOnTheScreen();
      expect(screen.getByText("12 / 20 hoy")).toBeOnTheScreen();
    });

    it("starts each day from zero", async () => {
      await renderContainer(
        answered([localDate("2026-10-28"), 30]),
        undefined,
        createFakeSettingsRepository({ dailyGoalPromptDismissed: true }),
      );

      expect(await screen.findByText("0 / 20 hoy")).toBeOnTheScreen();
    });

    it("says the goal is met once today's count reaches it", async () => {
      await renderContainer(
        answered([TODAY, 12]),
        undefined,
        createFakeSettingsRepository({ dailyGoal: "light", dailyGoalPromptDismissed: true }),
      );

      expect(await screen.findByText("¡Meta cumplida!")).toBeOnTheScreen();
    });

    it("hides the count without a goal", async () => {
      await renderContainer(
        answered([TODAY, 12]),
        undefined,
        createFakeSettingsRepository({ dailyGoal: "off", dailyGoalPromptDismissed: true }),
      );

      expect(
        await screen.findByRole("button", { name: "Meta diaria: Sin meta" }),
      ).toBeOnTheScreen();
      expect(screen.queryByRole("progressbar", { name: /Meta diaria/ })).toBeNull();
      expect(screen.queryByText(/\/ \d+ hoy/)).toBeNull();
    });

    it("stores a goal picked from the progress card and counts against it", async () => {
      const settings = createFakeSettingsRepository({ dailyGoalPromptDismissed: true });
      await renderContainer(answered([TODAY, 12]), undefined, settings);

      await fireEvent.press(
        await screen.findByRole("button", { name: "Meta diaria: Normal · 20" }),
      );
      await fireEvent.press(screen.getByRole("radio", { name: "Suave · 10" }));

      expect(
        await screen.findByRole("progressbar", {
          name: "¡Meta cumplida! 12 de 10 ejercicios hoy",
        }),
      ).toBeOnTheScreen();
      // Met since home was last seen: Avi cheers too.
      expect(screen.getAllByText("¡Meta cumplida!")).toHaveLength(2);
      expect(settings.dailyGoal()).toBe("light");
    });

    it("asks once to pick a goal, without blocking home, and remembers the answer", async () => {
      const settings = createFakeSettingsRepository();
      await renderContainer(answered([TODAY, 3]), undefined, settings);

      expect(await screen.findByText("¿Cuánto quieres practicar cada día?")).toBeOnTheScreen();
      // The default goal already counts behind it, and the path is right there.
      expect(screen.getByText("3 / 20 hoy")).toBeOnTheScreen();
      expect(screen.getByText("Lecciones de nivel A2")).toBeOnTheScreen();

      await fireEvent.press(screen.getByRole("button", { name: "Intensa · 40" }));

      expect(await screen.findByText("3 / 40 hoy")).toBeOnTheScreen();
      expect(screen.queryByText("¿Cuánto quieres practicar cada día?")).toBeNull();
      expect(settings.dailyGoal()).toBe("intense");
      expect(settings.dailyGoalPromptDismissed()).toBe(true);
    });

    it("closes the note with 'Ahora no', keeping the default goal", async () => {
      const settings = createFakeSettingsRepository();
      await renderContainer(answered([TODAY, 3]), undefined, settings);

      await fireEvent.press(await screen.findByRole("button", { name: "Ahora no" }));

      await waitFor(() =>
        expect(screen.queryByText("¿Cuánto quieres practicar cada día?")).toBeNull(),
      );
      expect(settings.dailyGoalPromptDismissed()).toBe(true);
      expect(settings.dailyGoal()).toBe("normal");
      expect(screen.getByText("3 / 20 hoy")).toBeOnTheScreen();
    });

    it("lets Avi cheer once the goal is met since home was last seen", async () => {
      const take = jest.fn(() => ({ ...NO_NEWS, goalMet: true }));
      await renderContainer(
        answered([TODAY, 20]),
        undefined,
        createFakeSettingsRepository({ lastHomeVisit: TODAY, dailyGoalPromptDismissed: true }),
        content,
        { take },
      );

      // The bubble beside the greeting, and the progress card.
      expect(await screen.findAllByText("¡Meta cumplida!")).toHaveLength(2);
      expect(take).toHaveBeenCalledWith(expect.objectContaining({ goalMet: true }));
    });

    it("tells Avi no goal is met without a goal", async () => {
      const take = jest.fn(() => NO_NEWS);
      await renderContainer(
        answered([TODAY, 50]),
        undefined,
        createFakeSettingsRepository({ dailyGoal: "off", dailyGoalPromptDismissed: true }),
        content,
        { take },
      );

      await screen.findByRole("button", { name: "Meta diaria: Sin meta" });
      expect(take).toHaveBeenCalledWith(expect.objectContaining({ goalMet: false }));
    });
  });

  describe("Avi beside the greeting", () => {
    it("greets a fresh learner, and remembers today's visit", async () => {
      const settings = createFakeSettingsRepository();
      await renderContainer(createFakeRepository(), undefined, settings);

      expect(await screen.findByText("¡Hola! Soy Avi. ¿Empezamos?")).toBeOnTheScreen();
      // Decorative: Avi is no button and opens nothing; the bubble says it all.
      expect(screen.queryByRole("button", { name: /Avi/ })).toBeNull();
      await waitFor(() => expect(settings.lastHomeVisit()).toBe(TODAY));
    });

    it("welcomes the learner back on the first visit of a new day", async () => {
      const settings = createFakeSettingsRepository({ lastHomeVisit: localDate("2026-10-28") });
      await renderContainer(
        createFakeRepository({
          xp: 10,
          streak: { current: 2, longest: 2, lastActiveDate: localDate("2026-10-28") },
        }),
        undefined,
        settings,
      );

      expect(await screen.findByText("¡Qué bueno verte!")).toBeOnTheScreen();
      await waitFor(() => expect(settings.lastHomeVisit()).toBe(TODAY));
    });

    it("misses a learner whose streak broke, never naming the days lost", async () => {
      await renderContainer(
        createFakeRepository({
          xp: 10,
          streak: { current: 6, longest: 6, lastActiveDate: localDate("2026-10-20") },
        }),
        undefined,
        createFakeSettingsRepository({ lastHomeVisit: localDate("2026-10-20") }),
      );

      expect(
        await screen.findByText("Te extrañé. Hoy empezamos una racha nueva."),
      ).toBeOnTheScreen();
    });

    it("celebrates a lesson completed since home was last seen", async () => {
      const memory = createCompletionMemory();
      memory.take([]);
      await renderContainer(
        createFakeRepository({ states: a2ItemIds.map((id) => initialState(id, TODAY)) }),
        memory,
        createFakeSettingsRepository({ lastHomeVisit: TODAY }),
        a2Content,
      );

      expect(await screen.findByText("¡Lo lograste!")).toBeOnTheScreen();
    });
  });
});

describe("HomeContainer level intro", () => {
  const a2Intro: LevelIntro = {
    level: "A2",
    title: "Nivel A2: el día a día",
    canDo: ["Contar tu rutina.", "Pedir indicaciones.", "Comprar ropa."],
    topics: ["Rutina diaria", "Compras"],
  };
  const b1Intro: LevelIntro = { ...a2Intro, level: "B1", title: "Nivel B1: te defiendes" };
  const introContent = createCorpus([
    { exercises: allExercises, passages: [passage], lessons: [lesson, b1Lesson], cards: [card] },
    { levelIntro: a2Intro },
    { levelIntro: b1Intro },
  ]);

  it("shows the level's intro above its lessons the first time, once", async () => {
    const settings = createFakeSettingsRepository();
    await renderContainer(createFakeRepository(), createCompletionMemory(), settings, introContent);

    expect(await screen.findByText("Al terminar este nivel podrás…")).toBeOnTheScreen();
    expect(screen.getByText("Nivel A2: el día a día")).toBeOnTheScreen();
    expect(screen.getByText("Contar tu rutina.")).toBeOnTheScreen();
    await waitFor(() => expect(settings.seenLevelIntros()).toEqual(["A2"]));

    await fireEvent.press(screen.getByRole("button", { name: "Entendido" }));
    expect(screen.queryByText("Al terminar este nivel podrás…")).not.toBeOnTheScreen();
  });

  it("keeps a seen intro closed, and reopens it from the path's header", async () => {
    await renderContainer(
      createFakeRepository(),
      createCompletionMemory(),
      createFakeSettingsRepository({ seenLevelIntros: ["A2"] }),
      introContent,
    );

    const reopen = await screen.findByRole("button", { name: "Qué aprenderás en el nivel A2" });
    expect(screen.queryByText("Al terminar este nivel podrás…")).not.toBeOnTheScreen();

    await fireEvent.press(reopen);
    expect(screen.getByText("Al terminar este nivel podrás…")).toBeOnTheScreen();
  });

  it("shows another level's intro the first time the path shows it", async () => {
    const settings = createFakeSettingsRepository({ seenLevelIntros: ["A2"] });
    await renderContainer(createFakeRepository(), createCompletionMemory(), settings, introContent);

    await fireEvent.press(await screen.findByRole("button", { name: /^Nivel del recorrido/ }));
    await fireEvent.press(screen.getByRole("radio", { name: "B1, 0 % completado" }));

    expect(await screen.findByText("Nivel B1: te defiendes")).toBeOnTheScreen();
    await waitFor(() => expect(settings.seenLevelIntros()).toEqual(["A2", "B1"]));
  });

  it("shows nothing for a level without an intro", async () => {
    await renderContainer(createFakeRepository());

    expect(await screen.findByLabelText("Racha: 0 días")).toBeOnTheScreen();
    expect(screen.queryByText("Al terminar este nivel podrás…")).not.toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: /^Qué aprenderás/ })).not.toBeOnTheScreen();
  });
});

it("opens the offline reference from home", async () => {
  await renderContainer(createFakeRepository());
  await fireEvent.press(
    await screen.findByRole("button", { name: "Referencia: phrasal verbs por tema" }),
  );
  expect(mockPush).toHaveBeenCalledWith("/diccionario");
});
