import { createCorpus } from "@english-learn/content";
import {
  initialState,
  localDate,
  review,
  type Clock,
  type ProgressRepository,
} from "@english-learn/domain";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type React from "react";
import { allExercises, card, lesson, passage } from "@/features/lesson/model/fixtures";
import { AppServicesProvider } from "@/infrastructure/services/app-services";
import { createFakeRepository } from "@/testing/fake-progress-repository";
import { createFakeSettingsRepository } from "@/testing/fake-settings-repository";
import { createFakeSoundPlayer } from "@/testing/fake-sound-player";
import { SoundPreferenceProvider } from "@/features/sound/sound-preference";
import { ThemePreferenceProvider } from "@/features/theme/theme-preference";
import { HomeContainer } from "./home-container";
import { OriginMoveOfferContext, type OriginMoveOffer } from "@/features/transfer/origin-move-gate";
import { AccountContext, type AccountContextValue } from "@/features/account/account-context";
import { createCompletionMemory, type CompletionMemory } from "./model/completion-memory";
import { withMotion } from "@/testing/motion";
import { StyleSheet } from "react-native";
import { testRandomBytes } from "@/testing/random-bytes";

const mockPush = jest.fn();

jest.mock("expo-router", () => {
  const { useEffect } = jest.requireActual<typeof React>("react");
  return {
    useRouter: () => ({ push: mockPush }),
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
  };
});

const TODAY = localDate("2026-10-29");
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

function renderContainer(
  repository: ProgressRepository,
  completionMemory: CompletionMemory = createCompletionMemory(),
) {
  return render(renderContainerElement(repository, completionMemory));
}

function renderContainerElement(
  repository: ProgressRepository,
  completionMemory: CompletionMemory = createCompletionMemory(),
) {
  return (
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
          <HomeContainer content={content} completionMemory={completionMemory} />
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

  it("marks a lesson as done once all its items have review states", async () => {
    const itemIds = [...new Set(allExercises.flatMap((e) => e.itemIds))];
    await renderContainer(
      createFakeRepository({ states: itemIds.map((id) => initialState(id, TODAY)) }),
    );

    expect(await screen.findByRole("button", { name: "Mi rutina, completada" })).toBeOnTheScreen();
  });

  it("draws the check of a lesson completed since home was last seen", async () => {
    withMotion();
    const memory = createCompletionMemory();
    memory.take([]); // Home was seen earlier in the session, with nothing done.
    const itemIds = [...new Set(allExercises.flatMap((e) => e.itemIds))];
    await renderContainer(
      createFakeRepository({ states: itemIds.map((id) => initialState(id, TODAY)) }),
      memory,
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
});
