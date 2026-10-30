import { createCorpus } from "@english-learn/content";
import { localDate, type PlacementResult } from "@english-learn/domain";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { lesson } from "@/features/lesson/model/fixtures";
import { AppServicesProvider } from "@/infrastructure/services/app-services";
import {
  createFakeRepository,
  type FakeProgressRepository,
} from "@/testing/fake-progress-repository";
import { createFakeSettingsRepository } from "@/testing/fake-settings-repository";
import { createFakeSoundPlayer, type FakeSoundPlayer } from "@/testing/fake-sound-player";
import { createPreventRemoveMock } from "@/testing/prevent-remove";
import { placementBank } from "./model/fixtures";
import { PlacementContainer } from "./placement-container";

const mockRouter = { canDismiss: jest.fn(() => true), dismissAll: jest.fn(), replace: jest.fn() };
const mockPreventRemove = createPreventRemoveMock();
jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
  usePreventRemove: (...args: Parameters<typeof mockPreventRemove.hook>) =>
    mockPreventRemove.hook(...args),
}));

const TODAY = localDate("2026-10-29");
const b1Lesson = { ...lesson, id: "b1.routine.lesson-001", level: "B1" } as const;
const content = createCorpus([{ lessons: [lesson, b1Lesson], placement: placementBank(5) }]);

function renderPlacement(repository: FakeProgressRepository) {
  return render(
    <AppServicesProvider
      services={{
        progressRepository: repository,
        clock: { today: () => TODAY, nowMs: () => 0 },
        random: () => 0.5,
        settingsRepository: createFakeSettingsRepository(),
        sounds,
      }}
    >
      <PlacementContainer content={content} />
    </AppServicesProvider>,
  );
}

/** Answers until the result shows; returns how many questions were asked. */
async function answerAll(option: "ok" | "no"): Promise<number> {
  let asked = 0;
  while (screen.queryByRole("button", { name: "Siguiente" }) !== null) {
    asked += 1;
    expect(screen.getByText(`Pregunta ${asked} de hasta 20`)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("radio", { name: option }));
    await fireEvent.press(screen.getByRole("button", { name: "Siguiente" }));
  }
  return asked;
}

let sounds: FakeSoundPlayer;
beforeEach(() => {
  jest.clearAllMocks();
  sounds = createFakeSoundPlayer();
});

describe("PlacementContainer", () => {
  it("runs the adaptive test, saves only the placement result and shows the level", async () => {
    const progress = {
      xp: 40,
      streak: { current: 2, longest: 2, lastActiveDate: TODAY },
      states: [],
    };
    const repository = createFakeRepository(progress);
    await renderPlacement(repository);

    await fireEvent.press(screen.getByRole("button", { name: "Empezar" }));
    const asked = await answerAll("ok");

    expect(asked).toBeGreaterThanOrEqual(15);
    expect(asked).toBeLessThanOrEqual(20);
    expect(await screen.findByLabelText("Tu nivel estimado: C1")).toBeOnTheScreen();
    expect(screen.getByText(/Te recomendamos las de nivel B1/)).toBeOnTheScreen();
    const saved = repository.snapshot();
    expect(saved.placement?.level).toBe("C1");
    expect(saved.placement?.theta).toBeGreaterThanOrEqual(1.5);
    // Placement never touches SRS, XP or streak.
    expect(saved).toMatchObject(progress);
  });

  it("only taps during the test (no right or wrong sounds) and chimes at the result", async () => {
    await renderPlacement(createFakeRepository());
    await fireEvent.press(screen.getByRole("button", { name: "Empezar" }));

    const asked = await answerAll("no");
    await screen.findByText("Tu nivel estimado");

    expect(sounds.played).toEqual([...Array<string>(asked).fill("tap"), "complete"]);
  });

  it("asks before leaving once a question was answered, and never after the result", async () => {
    const repository = createFakeRepository();
    await renderPlacement(repository);
    await fireEvent.press(screen.getByRole("button", { name: "Empezar" }));
    expect(mockPreventRemove.active).toBe(false);

    await fireEvent.press(screen.getByRole("radio", { name: "ok" }));
    await fireEvent.press(screen.getByRole("button", { name: "Siguiente" }));
    expect(mockPreventRemove.active).toBe(true);

    const repeat = await mockPreventRemove.attemptLeave();
    expect(screen.getByText("¿Salir del test de nivel?")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Seguir aquí" }));
    expect(repeat).not.toHaveBeenCalled();

    while (screen.queryByRole("button", { name: "Siguiente" }) !== null) {
      await fireEvent.press(screen.getByRole("radio", { name: "ok" }));
      await fireEvent.press(screen.getByRole("button", { name: "Siguiente" }));
    }
    await screen.findByLabelText("Tu nivel estimado: C1");
    expect(mockPreventRemove.active).toBe(false);
  });

  it("recommends A2 lessons when the estimate is A1", async () => {
    const repository = createFakeRepository();
    await renderPlacement(repository);

    await fireEvent.press(screen.getByRole("button", { name: "Empezar" }));
    await answerAll("no");

    expect(await screen.findByLabelText("Tu nivel estimado: A1")).toBeOnTheScreen();
    expect(screen.getByText(/Te recomendamos las de nivel A2/)).toBeOnTheScreen();
  });

  it("overwrites a previous result when the test is retaken", async () => {
    const previous: PlacementResult = { level: "A2", theta: -1 };
    const repository = createFakeRepository({ placement: previous });
    await renderPlacement(repository);

    await fireEvent.press(screen.getByRole("button", { name: "Empezar" }));
    await answerAll("ok");
    await screen.findByLabelText("Tu nivel estimado: C1");

    expect(repository.snapshot().placement?.level).toBe("C1");
  });

  it("retries a failed save and then goes to the lessons", async () => {
    const repository = createFakeRepository();
    const save = repository.savePlacementResult;
    repository.savePlacementResult = jest
      .fn<Promise<void>, Parameters<typeof save>>()
      .mockRejectedValueOnce(new Error("disk I/O error"))
      .mockImplementation(save);
    jest.spyOn(console, "error").mockImplementation(() => {});
    await renderPlacement(repository);

    await fireEvent.press(screen.getByRole("button", { name: "Empezar" }));
    await answerAll("ok");
    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos guardar tu resultado.");

    await fireEvent.press(screen.getByRole("button", { name: "Reintentar" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Ir a mis lecciones" }));

    expect(repository.snapshot().placement?.level).toBe("C1");
    expect(mockRouter.dismissAll).toHaveBeenCalledTimes(1);
  });
});
