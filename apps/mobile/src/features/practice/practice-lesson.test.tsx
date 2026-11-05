import { localDate } from "@english-learn/domain";
import { render, screen } from "@testing-library/react-native";
import { LessonContainer } from "@/features/lesson/lesson-container";
import { AppServicesProvider } from "@/infrastructure/services/app-services";
import { createFakeRepository } from "@/testing/fake-progress-repository";
import { createFakeSettingsRepository } from "@/testing/fake-settings-repository";
import { createFakeSoundPlayer } from "@/testing/fake-sound-player";
import { createPreventRemoveMock } from "@/testing/prevent-remove";
import { testRandomBytes } from "@/testing/random-bytes";
import { practiceContent } from "./model/fixtures";

const mockRouter = {
  canDismiss: jest.fn(() => true),
  dismissAll: jest.fn(),
  canGoBack: jest.fn(() => true),
  back: jest.fn(),
  replace: jest.fn(),
  push: jest.fn(),
};
const mockPreventRemove = createPreventRemoveMock();
jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
  usePreventRemove: (...args: Parameters<typeof mockPreventRemove.hook>) =>
    mockPreventRemove.hook(...args),
  Stack: { Screen: () => null },
}));

function renderLesson(lessonId: string) {
  return render(
    <AppServicesProvider
      services={{
        progressRepository: createFakeRepository(),
        clock: { today: () => localDate("2030-01-01"), nowMs: () => 0 },
        random: () => 0.5,
        randomBytes: testRandomBytes,
        deviceId: "test-device",
        settingsRepository: createFakeSettingsRepository(),
        sounds: createFakeSoundPlayer(),
      }}
    >
      <LessonContainer lessonId={lessonId} content={practiceContent} />
    </AppServicesProvider>,
  );
}

describe("a practice lesson on the lesson screen", () => {
  it("plays like a path lesson", async () => {
    await renderLesson("a2.phrasal-verbs.practice-home-1");

    expect(screen.getByText("Casa y rutina: conócelos")).toBeOnTheScreen();
    expect(screen.getByText("Ejercicio 1 de 6")).toBeOnTheScreen();
    expect(screen.queryByText("No encontramos esta lección.")).toBeNull();
  });

  it("still finds path lessons and nothing else", async () => {
    await renderLesson("a2.routine.lesson-001");
    expect(screen.getByText("Mi rutina")).toBeOnTheScreen();

    await renderLesson("practice.phrasal-verbs.home");
    expect(screen.getByText("No encontramos esta lección.")).toBeOnTheScreen();
  });
});
