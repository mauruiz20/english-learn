import { createCorpus } from "@english-learn/content";
import {
  initialState,
  localDate,
  type Clock,
  type ProgressRepository,
} from "@english-learn/domain";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type React from "react";
import { allExercises, lesson, passage } from "@/features/lesson/model/fixtures";
import { AppServicesProvider } from "@/infrastructure/services/app-services";
import { createFakeRepository } from "@/testing/fake-progress-repository";
import { HomeContainer } from "./home-container";

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
  { exercises: allExercises, passages: [passage], lessons: [lesson, b1Lesson] },
]);

function renderContainer(repository: ProgressRepository) {
  return render(
    <AppServicesProvider
      services={{ progressRepository: repository, clock: fixedClock, random: () => 0 }}
    >
      <HomeContainer content={content} />
    </AppServicesProvider>,
  );
}

beforeEach(() => jest.clearAllMocks());

describe("HomeContainer", () => {
  it("renders the empty progress of a new learner", async () => {
    await renderContainer(createFakeRepository());

    expect(await screen.findByText("Racha: 0 días")).toBeOnTheScreen();
    expect(screen.getByText("XP: 0")).toBeOnTheScreen();
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

    expect(await screen.findByText("Racha: 4 días")).toBeOnTheScreen();
    expect(screen.getByText("XP: 250")).toBeOnTheScreen();
    expect(screen.getByText("Tu nivel: B2")).toBeOnTheScreen();
  });

  it("shows a broken streak as zero days", async () => {
    await renderContainer(
      createFakeRepository({
        streak: { current: 7, longest: 7, lastActiveDate: localDate("2026-10-20") },
      }),
    );

    expect(await screen.findByText("Racha: 0 días")).toBeOnTheScreen();
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

  it("opens a lesson", async () => {
    await renderContainer(createFakeRepository());

    await fireEvent.press(await screen.findByRole("button", { name: "Mi rutina" }));

    expect(mockPush).toHaveBeenCalledWith("/lesson/a2.routine.lesson-001");
  });
});
