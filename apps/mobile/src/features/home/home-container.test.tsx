import { createCorpus, type Corpus, type VocabExercise } from "@english-learn/content";
import {
  initialState,
  localDate,
  review,
  type Clock,
  type ProgressEvent,
  type ProgressRepository,
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
import { HomeContainer } from "./home-container";
import { OriginMoveOfferContext, type OriginMoveOffer } from "@/features/transfer/origin-move-gate";
import { AccountContext, type AccountContextValue } from "@/features/account/account-context";
import { createCompletionMemory, type CompletionMemory } from "./model/completion-memory";
import { createHomeAviMemory, type HomeAviMemory } from "./model/home-avi";
import { withMotion } from "@/testing/motion";
import { StyleSheet } from "react-native";
import { testRandomBytes } from "@/testing/random-bytes";
import { corpus } from "@english-learn/content/corpus";
import { lessonItemIds } from "@/features/lesson/model/lesson-catalog";
import { planReview, reviewOutlook } from "@/features/review/model/review-plan";

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

  it("shows the plumas balance and, for study done before plumas, the one-time note", async () => {
    // Two lessons a baseline completed (before the event log): 5 plumas each.
    await renderContainer(createFakeRepository({ xp: 120, completedLessonIds: ["l1", "l2"] }));

    expect(await screen.findByLabelText("Tienes 10 plumas")).toBeOnTheScreen();
    expect(
      await screen.findByText("Avi te guardó 10 plumas por lo que ya estudiaste."),
    ).toBeOnTheScreen();
  });

  it("decides nothing on an empty store (a new device before its first sync pull)", async () => {
    const settings = createFakeSettingsRepository();
    await renderContainer(createFakeRepository(), undefined, settings);

    expect(await screen.findByLabelText("Tienes 0 plumas")).toBeOnTheScreen();
    expect(screen.queryByText(/Avi te guardó/)).toBeNull();
    expect(settings.plumasWelcome()).toBeNull();
  });

  it("never tells a learner who started with plumas about past study, even after a lesson", async () => {
    const repository = createFakeRepository();
    await completeSession({
      repository,
      today: TODAY,
      nowMs: 0,
      randomBytes: testRandomBytes,
      deviceId: "test-device",
      kind: "lesson",
      summary: { lessonId: lesson.id, verdicts: [], accuracy: 1, answerXp: 0, itemOutcomes: [] },
    });
    const settings = createFakeSettingsRepository();
    await renderContainer(repository, undefined, settings);

    expect(await screen.findByLabelText("Tienes 20 plumas")).toBeOnTheScreen();
    await waitFor(() => expect(settings.plumasWelcome()).toEqual({ plumas: 0, dismissed: true }));
    expect(screen.queryByText(/Avi te guardó/)).toBeNull();
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

  it("counts the study cards studied and opens them", async () => {
    await renderContainer(
      createFakeRepository({ states: card.itemIds.map((id) => initialState(id, TODAY)) }),
    );

    await fireEvent.press(
      await screen.findByRole("button", { name: "Fichas: 1 ficha, 1 estudiada" }),
    );
    expect(mockPush).toHaveBeenCalledWith("/fichas");
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
  describe("Avi beside the greeting", () => {
    const wardrobeEvent = (n: number, event: Pick<ProgressEvent, "type" | "payload">) =>
      ({
        id: `019a0000-0000-7000-8000-00000000000${n}`,
        deviceId: "test-device",
        occurredAt: n,
        localDate: TODAY,
        ...event,
      }) as ProgressEvent;

    it("greets a fresh learner, and remembers today's visit", async () => {
      const settings = createFakeSettingsRepository();
      await renderContainer(createFakeRepository(), undefined, settings);

      expect(await screen.findByText("¡Hola! Soy Avi. ¿Empezamos?")).toBeOnTheScreen();
      expect(
        screen.getByRole("button", { name: "Avi, contento. Abre el armario" }),
      ).toBeOnTheScreen();
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
      expect(
        screen.getByRole("button", { name: "Avi, con ganas de verte. Abre el armario" }),
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

    it("shows off a new outfit, says what it wears and opens the wardrobe", async () => {
      const repository = createFakeRepository({ xp: 1, completedLessonIds: ["a", "b", "c"] });
      const aviMemory = createHomeAviMemory();
      const settings = createFakeSettingsRepository({ lastHomeVisit: TODAY });
      const first = await renderContainer(repository, undefined, settings, content, aviMemory);
      expect(
        await screen.findByRole("button", { name: "Avi, contento. Abre el armario" }),
      ).toBeOnTheScreen();
      await first.unmount();

      await repository.appendEvents([
        wardrobeEvent(1, {
          type: "item_purchased",
          payload: { v: 1, itemId: "estrella", price: 40 },
        }),
        wardrobeEvent(2, {
          type: "item_equipped",
          payload: { v: 1, slot: "sticker", itemId: "estrella" },
        }),
      ]);
      await renderContainer(repository, undefined, settings, content, aviMemory);

      expect(await screen.findByText("¿Cómo me veo?")).toBeOnTheScreen();
      const avi = screen.getByRole("button", {
        name: "Avi, estrenando ropa, con sticker de estrella. Abre el armario",
      });
      await fireEvent.press(avi);
      expect(mockPush).toHaveBeenCalledWith("/armario");
    });
  });
});
