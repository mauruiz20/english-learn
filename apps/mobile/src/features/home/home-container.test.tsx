import {
  localDate,
  type Clock,
  type PlacementResult,
  type ProgressRepository,
  type Streak,
} from "@english-learn/domain";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type React from "react";
import { AppServicesProvider } from "@/infrastructure/services/app-services";
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

function createFakeRepository(
  initial: { streak?: Streak; xp?: number; placement?: PlacementResult | null } = {},
): ProgressRepository {
  let streak: Streak = initial.streak ?? { current: 0, longest: 0, lastActiveDate: null };
  let xp = initial.xp ?? 0;
  let placement = initial.placement ?? null;
  return {
    getReviewStates: async () => [],
    saveReviewStates: async () => {},
    getStreak: async () => streak,
    saveStreak: async (next) => {
      streak = next;
    },
    getXp: async () => xp,
    addXp: async (amount) => (xp += amount),
    getPlacementResult: async () => placement,
    savePlacementResult: async (level, theta) => {
      placement = { level, theta };
    },
  };
}

function renderContainer(repository: ProgressRepository) {
  return render(
    <AppServicesProvider services={{ progressRepository: repository, clock: fixedClock }}>
      <HomeContainer />
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
});
