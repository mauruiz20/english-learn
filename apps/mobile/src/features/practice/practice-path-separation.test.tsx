import { corpus } from "@english-learn/content/corpus";
import { localDate, type ProgressRepository } from "@english-learn/domain";
import { render, screen } from "@testing-library/react-native";
import type React from "react";
import { completeSession } from "@/features/lesson/application/complete-session";
import { achievementFacts } from "@/features/achievements/model/achievements";
import {
  DEFAULT_LEVEL,
  isLessonDone,
  lessonExercises,
  pathLessons,
} from "@/features/lesson/model/lesson-catalog";
import { HomeContainer } from "@/features/home/home-container";
import { SoundPreferenceProvider } from "@/features/sound/sound-preference";
import { ThemePreferenceProvider } from "@/features/theme/theme-preference";
import { AppServicesProvider } from "@/infrastructure/services/app-services";
import { createFakeRepository } from "@/testing/fake-progress-repository";
import { createFakeSettingsRepository } from "@/testing/fake-settings-repository";
import { createFakeSoundPlayer } from "@/testing/fake-sound-player";
import { testRandomBytes } from "@/testing/random-bytes";

jest.mock("expo-router", () => {
  const { useEffect } = jest.requireActual<typeof React>("react");
  return {
    useRouter: () => ({ push: jest.fn() }),
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
  };
});

const TODAY = localDate("2030-01-01");

/** Saves every practice lesson as completed with every answer right. */
async function completeAllPractice(repository: ProgressRepository) {
  let now = 1;
  for (const lesson of corpus.practiceLessons) {
    const exercises = lessonExercises(lesson, corpus.exercisesById);
    await completeSession({
      repository,
      today: TODAY,
      nowMs: now++,
      randomBytes: testRandomBytes,
      deviceId: "test-device",
      kind: "lesson",
      summary: {
        lessonId: lesson.id,
        verdicts: exercises.map(() => "correct"),
        accuracy: 1,
        answerXp: exercises.length * 10,
        itemOutcomes: exercises.flatMap((e) =>
          e.itemIds.map((itemId) => ({
            itemId,
            exerciseType: e.type,
            verdict: "correct" as const,
            responseMs: 1000,
          })),
        ),
      },
    });
  }
}

/** The path as home shows it: every stop's label, and which one is next. */
async function pathOnHome(repository: ProgressRepository) {
  const view = await render(
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
      <SoundPreferenceProvider>
        <ThemePreferenceProvider>
          <HomeContainer content={corpus} />
        </ThemePreferenceProvider>
      </SoundPreferenceProvider>
    </AppServicesProvider>,
  );
  // No placement: home shows the default level, so its first lesson is the next one.
  const first = corpus.lessons.find((l) => l.level === DEFAULT_LEVEL)!;
  const next = await screen.findByRole("button", { name: first.title });
  const titles = new Set(corpus.lessons.map((l) => l.title));
  const stops = screen
    .getAllByRole("button")
    .map((b) => String(b.props.accessibilityLabel ?? ""))
    .filter((label) => titles.has(label.split(",")[0] ?? ""));
  const result = { next: next.props.accessibilityHint as string | undefined, stops };
  await view.unmount();
  return result;
}

describe("Práctica libre and the learning path", () => {
  it("completing every practice lesson leaves the path's progress unchanged", async () => {
    const before = await pathOnHome(createFakeRepository());
    const repository = createFakeRepository();
    await completeAllPractice(repository);
    expect((await repository.getLessonResults()).length).toBe(corpus.practiceLessons.length);

    const after = await pathOnHome(repository);

    expect(before.stops.length).toBeGreaterThan(5);
    expect(after).toEqual(before);
    expect(after.next).toBe("Tu siguiente lección");
    expect(after.stops.some((label) => label.includes("completada"))).toBe(false);
    // It saves every practice lesson and renders home twice: slow under a loaded runner.
  }, 60_000);

  it("never lets practice move the path to the next level or complete a level", async () => {
    const empty = createFakeRepository();
    const repository = createFakeRepository();
    await completeAllPractice(repository);
    const progress = async (r: ProgressRepository) => ({
      states: await r.getReviewStates(),
      xp: await r.getXp(),
      streak: await r.getStreak(),
      placement: await r.getPlacementResult(),
    });
    const before = await progress(empty);
    const after = await progress(repository);
    const practiceIds = new Set(corpus.practiceLessons.map((l) => l.id));

    for (const level of [null, "A1", "A2", "B1", "B2", "C1"] as const) {
      const reviewed = new Set(after.states.map((s) => s.itemId));
      const path = pathLessons(corpus.lessons, level, (lesson) =>
        isLessonDone(lesson, corpus.exercisesById, reviewed),
      );
      const fresh = pathLessons(corpus.lessons, level, () => false);
      expect(path.level).toBe(fresh.level);
      expect(path.lessons.some((l) => practiceIds.has(l.id))).toBe(false);
    }
    const factsBefore = achievementFacts(corpus, before);
    const factsAfter = achievementFacts(corpus, after);
    expect(factsAfter.lessonsDone).toBe(factsBefore.lessonsDone);
    expect(factsAfter.topicsDone).toBe(factsBefore.topicsDone);
    expect(factsAfter.levelsDone).toEqual(factsBefore.levelsDone);
  });
});
