import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type React from "react";
import { CHECKPOINT_DELAY_MS, localDate, type Clock } from "@english-learn/domain";
import { AppServicesProvider } from "@/infrastructure/services/app-services";
import { createFakeRepository } from "@/testing/fake-progress-repository";
import { createFakeSettingsRepository } from "@/testing/fake-settings-repository";
import { createFakeSoundPlayer } from "@/testing/fake-sound-player";
import { testRandomBytes } from "@/testing/random-bytes";
import { sessionCompletedEvent } from "@/features/progress/progress-events";
import { ThemePreferenceProvider } from "@/features/theme/theme-preference";
import { CheckpointContainer } from "./checkpoint-container";

const mockReplace = jest.fn();

jest.mock("expo-router", () => {
  const { useEffect } = jest.requireActual<typeof React>("react");
  return {
    useRouter: () => ({ replace: mockReplace, canGoBack: () => true, back: jest.fn() }),
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
  };
});

jest.mock("@/shared/ui/use-reduced-motion", () => ({ useReducedMotion: () => true }));

const STARTED_AT = Date.UTC(2026, 0, 1, 9);
const CHECKPOINT_ID = "a1.introductions";
const LESSON_ID = "a1.greetings.lesson-002";

async function setup({
  now = STARTED_AT + CHECKPOINT_DELAY_MS,
  withLesson = true,
  existingRepository,
  baselineOnly = false,
}: {
  now?: number;
  withLesson?: boolean;
  existingRepository?: ReturnType<typeof createFakeRepository>;
  baselineOnly?: boolean;
} = {}) {
  let current = now;
  const clock: Clock = {
    nowMs: () => current,
    today: () => localDate(new Date(current).toISOString().slice(0, 10)),
  };
  const lessonEvent = sessionCompletedEvent(
    {
      deviceId: "test-device",
      occurredAt: STARTED_AT,
      localDate: localDate("2026-01-01"),
      randomBytes: testRandomBytes,
    },
    { sessionId: "source-session", kind: "lesson", lessonId: LESSON_ID, answerXp: 10, accuracy: 1 },
  );
  const repository =
    existingRepository ??
    createFakeRepository(
      baselineOnly
        ? { completedLessonIds: [LESSON_ID] }
        : { events: withLesson ? [lessonEvent] : [] },
    );
  const initialProgress = repository.snapshot();
  const append = jest.spyOn(repository, "appendEvents");
  const view = await render(
    <AppServicesProvider
      services={{
        progressRepository: repository,
        clock,
        random: () => 0,
        randomBytes: testRandomBytes,
        deviceId: "test-device",
        settingsRepository: createFakeSettingsRepository(),
        sounds: createFakeSoundPlayer(),
      }}
    >
      <ThemePreferenceProvider>
        <CheckpointContainer />
      </ThemePreferenceProvider>
    </AppServicesProvider>,
  );
  return {
    ...view,
    repository,
    initialProgress,
    append,
    setNow: (value: number) => {
      current = value;
    },
  };
}

beforeEach(() => jest.clearAllMocks());

describe("CheckpointContainer", () => {
  it("offers the source lesson rather than inventing a timestamp for baseline-only history", async () => {
    const { repository } = await setup({ baselineOnly: true });
    expect(
      await screen.findByRole("button", { name: "Abrir la lección «¿Cómo te llamas?»" }),
    ).toBeOnTheScreen();
    expect(await repository.getCheckpointEvidence(CHECKPOINT_ID, LESSON_ID)).toEqual({
      completedAt: null,
      result: null,
    });
  });

  it("preserves an incorrect score and its date on remount without ordinary progress effects", async () => {
    const { repository, initialProgress, unmount } = await setup();
    await screen.findByText("My name is Leo.");
    await fireEvent.press(screen.getByRole("radio", { name: "Hasta luego." }));
    await fireEvent.press(screen.getByRole("button", { name: "Comprobar" }));
    expect(screen.getByRole("alert")).toHaveTextContent("No es correcto");
    await fireEvent.press(screen.getByRole("button", { name: "Continuar" }));
    await answer("¿Cómo te llamas?");
    await answer("Mucho gusto.");
    await fireEvent.press(screen.getByRole("button", { name: "Guardar resultado" }));
    expect(await screen.findByText("2 de 3 respuestas correctas")).toBeOnTheScreen();
    expect(repository.snapshot()).toEqual(initialProgress);
    expect((await repository.getCheckpointEvidence(CHECKPOINT_ID, LESSON_ID)).result).toEqual({
      correct: 2,
      total: 3,
      occurredAt: STARTED_AT + CHECKPOINT_DELAY_MS,
      localDate: "2026-01-02",
    });
    expect(repository.events().at(-1)?.payload).not.toHaveProperty("answers");
    await unmount();
    await setup({ existingRepository: repository });
    expect(await screen.findByText("2 de 3 respuestas correctas")).toBeOnTheScreen();
    expect(screen.getByText("Fecha: 2 de enero de 2026")).toBeOnTheScreen();
    expect(screen.queryByText("My name is Leo.")).toBeNull();
  });

  it("offers the source lesson when historical completion evidence is missing", async () => {
    await setup({ withLesson: false });

    expect(await screen.findByText(/24 horas después de completar/)).toBeOnTheScreen();
    expect(
      screen.getByRole("button", { name: "Abrir la lección «¿Cómo te llamas?»" }),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/Te presentas a una nueva compañera de trabajo./)).toBeNull();
    await fireEvent.press(
      screen.getByRole("button", { name: "Abrir la lección «¿Cómo te llamas?»" }),
    );
    expect(mockReplace).toHaveBeenCalledWith(`/lesson/${LESSON_ID}`);
  });

  it("does not show questions before the exact 24-hour boundary", async () => {
    await setup({ now: STARTED_AT + CHECKPOINT_DELAY_MS - 1 });

    expect(await screen.findByText(/La comprobación estará disponible/)).toBeOnTheScreen();
    expect(screen.queryByText(/Te presentas a una nueva compañera de trabajo./)).toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("unlocks the open direct route at the exact 24-hour boundary", async () => {
    jest.useFakeTimers();
    try {
      const { setNow } = await setup({ now: STARTED_AT + CHECKPOINT_DELAY_MS - 1 });
      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.getByText(/disponible cuando hayan pasado/)).toBeOnTheScreen();
      setNow(STARTED_AT + CHECKPOINT_DELAY_MS);
      await act(async () => {
        jest.advanceTimersByTime(2);
        await Promise.resolve();
      });
      expect(screen.getByText(/Te presentas a una persona nueva en el trabajo./)).toBeOnTheScreen();
    } finally {
      jest.useRealTimers();
    }
  });

  it("rechecks eligibility immediately before saving", async () => {
    const { repository, append } = await setup();
    jest.spyOn(repository, "getCheckpointEvidence").mockResolvedValue({
      completedAt: null,
      result: null,
    });
    await answer("Me llamo Leo.");
    await answer("¿Cómo te llamas?");
    await answer("Mucho gusto.");
    await fireEvent.press(screen.getByRole("button", { name: "Guardar resultado" }));

    expect(
      await screen.findByRole("button", { name: "Abrir la lección «¿Cómo te llamas?»" }),
    ).toBeOnTheScreen();
    expect(append).not.toHaveBeenCalled();
    expect(
      repository.events().filter((event) => event.type === "checkpoint_completed"),
    ).toHaveLength(0);
  });

  it("saves one checkpoint result with score and date without ordinary progress events", async () => {
    const { repository, initialProgress, append } = await setup();
    expect(
      await screen.findByText("Te presentas a una persona nueva en el trabajo."),
    ).toBeOnTheScreen();
    expect(screen.getByText("My name is Leo.")).toBeOnTheScreen();

    await answer("Me llamo Leo.");
    await answer("¿Cómo te llamas?");
    await answer("Mucho gusto.");
    await fireEvent.press(screen.getByRole("button", { name: "Guardar resultado" }));

    expect(await screen.findByText("3 de 3 respuestas correctas")).toBeOnTheScreen();
    expect(await screen.findByText("Fecha: 2 de enero de 2026")).toBeOnTheScreen();
    const writes = append.mock.calls.flatMap(([events]) => events);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      type: "checkpoint_completed",
      occurredAt: STARTED_AT + CHECKPOINT_DELAY_MS,
      localDate: "2026-01-02",
      payload: { checkpointId: CHECKPOINT_ID, lessonId: LESSON_ID, correct: 3, total: 3 },
    });
    expect(
      writes.some((event) => event.type === "item_reviewed" || event.type === "session_completed"),
    ).toBe(false);
    expect(repository.snapshot()).toEqual(initialProgress);
    expect(
      repository.events().filter((event) => event.type === "checkpoint_completed"),
    ).toHaveLength(1);
  });

  it("offers retry after an atomic save failure and never reports a false success", async () => {
    const { repository, append } = await setup();
    append.mockRejectedValueOnce(new Error("disk full"));
    expect(
      await screen.findByText(/Te presentas a una persona nueva en el trabajo./),
    ).toBeOnTheScreen();
    await answer("Me llamo Leo.");
    await answer("¿Cómo te llamas?");
    await answer("Mucho gusto.");
    await fireEvent.press(screen.getByRole("button", { name: "Guardar resultado" }));

    expect(await screen.findByText("No pudimos guardar el resultado.")).toBeOnTheScreen();
    expect(screen.queryByText("Resultado de la comprobación")).toBeNull();
    expect(
      repository.events().filter((event) => event.type === "checkpoint_completed"),
    ).toHaveLength(0);
    await fireEvent.press(screen.getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(screen.getByText("3 de 3 respuestas correctas")).toBeOnTheScreen());
    expect(append).toHaveBeenCalledTimes(2);
  });

  it("ignores a duplicate save press while the first append is pending", async () => {
    const { repository, append } = await setup();
    const appendOnce = repository.appendEvents.bind(repository);
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    append.mockImplementationOnce(async (events) => {
      await pending;
      return appendOnce(events);
    });
    await answer("Me llamo Leo.");
    await answer("¿Cómo te llamas?");
    await answer("Mucho gusto.");

    const saveButton = screen.getByRole("button", { name: "Guardar resultado" });
    const firstPress = fireEvent.press(saveButton);
    const duplicatePress = fireEvent.press(saveButton);
    await waitFor(() => expect(append).toHaveBeenCalledTimes(1));
    release();
    await Promise.all([firstPress, duplicatePress]);
    expect(
      repository.events().filter((event) => event.type === "checkpoint_completed"),
    ).toHaveLength(1);
  });
});

async function answer(option: string) {
  await fireEvent.press(screen.getByRole("radio", { name: option }));
  await fireEvent.press(screen.getByRole("button", { name: "Comprobar" }));
  await screen.findByText(/Correcto|No es correcto/);
  expect(screen.getByRole("alert")).toHaveTextContent("Correcto");
  await fireEvent.press(screen.getByRole("button", { name: "Continuar" }));
}
