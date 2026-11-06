import { localDate } from "@english-learn/domain";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type React from "react";
import type { ReactNode } from "react";
import { AppServicesProvider } from "@/infrastructure/services/app-services";
import {
  createFakeRepository,
  type FakeProgressRepository,
} from "@/testing/fake-progress-repository";
import { createFakeSettingsRepository } from "@/testing/fake-settings-repository";
import { createFakeSoundPlayer } from "@/testing/fake-sound-player";
import { testRandomBytes } from "@/testing/random-bytes";
import { dialogueContent } from "@/features/dialogues/model/fixtures";
import { practiceContent } from "./model/fixtures";
import { PracticeCollectionContainer, PracticeContainer } from "./practice-containers";

const mockRouter = { push: jest.fn() };
jest.mock("expo-router", () => {
  const { useEffect } = jest.requireActual<typeof React>("react");
  return {
    useRouter: () => mockRouter,
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
  };
});

const TODAY = localDate("2030-01-01");
const HOME_1 = "a2.phrasal-verbs.practice-home-1";

/** A repository where `HOME_1` was completed once with `accuracy` (saved as a lesson). */
async function practiced(accuracy: number) {
  const repository = createFakeRepository();
  await repository.appendEvents([
    {
      id: "0190000a-0000-7000-8000-000000000001",
      deviceId: "test-device",
      occurredAt: 1,
      localDate: TODAY,
      type: "session_completed",
      payload: { v: 1, sessionId: "s1", kind: "lesson", lessonId: HOME_1, answerXp: 60, accuracy },
    },
  ]);
  return repository;
}

function withServices(repository: FakeProgressRepository, children: ReactNode) {
  return (
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
      {children}
    </AppServicesProvider>
  );
}

beforeEach(() => jest.clearAllMocks());

describe("PracticeContainer", () => {
  it("lists the collections with the lessons done, and opens one", async () => {
    const repository = await practiced(1);
    await render(withServices(repository, <PracticeContainer content={practiceContent} />));

    const row = await screen.findByRole("button", {
      name: "Phrasal verbs: 1 grupo, 2 lecciones, 1 hecha",
    });
    await fireEvent.press(row);
    expect(mockRouter.push).toHaveBeenCalledWith("/practica/phrasal-verbs");
  });
});

describe("PracticeCollectionContainer", () => {
  it("shows each lesson's best result and plays it on the lesson screen", async () => {
    const repository = await practiced(1);
    await render(
      withServices(
        repository,
        <PracticeCollectionContainer slug="phrasal-verbs" content={practiceContent} />,
      ),
    );

    expect(await screen.findByText("Perfecta · 6/6")).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole("button", { name: "Casa y rutina: practícalos, nueva" }),
    );
    expect(mockRouter.push).toHaveBeenCalledWith("/lesson/a2.phrasal-verbs.practice-home-2");
  });

  it("plays a dialogue of the Diálogos collection on the dialogue screen", async () => {
    await render(
      withServices(
        createFakeRepository(),
        <PracticeCollectionContainer slug="dialogues" content={dialogueContent} />,
      ),
    );

    await fireEvent.press(await screen.findByRole("button", { name: "En la cafetería, nuevo" }));
    expect(mockRouter.push).toHaveBeenCalledWith("/dialogo/a2.dialogues.cafe");
  });

  it("says when the collection does not exist", async () => {
    await render(
      withServices(
        createFakeRepository(),
        <PracticeCollectionContainer slug="nada" content={practiceContent} />,
      ),
    );
    expect(await screen.findByText("No encontramos este tema de práctica.")).toBeOnTheScreen();
  });
});
