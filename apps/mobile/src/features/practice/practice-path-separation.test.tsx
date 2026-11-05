import { corpus } from "@english-learn/content/corpus";
import { localDate, type ProgressRepository } from "@english-learn/domain";
import { render, screen } from "@testing-library/react-native";
import type React from "react";
import { completeSession } from "@/features/lesson/application/complete-session";
import { lessonExercises } from "@/features/lesson/model/lesson-catalog";
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
  const next = await screen.findByRole("button", { name: corpus.lessons[0]!.title });
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
  });
});
