import { isStreakAlive } from "@english-learn/domain";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { useAppServices } from "@/infrastructure/services/app-services";
import { HomeView, type HomeViewState } from "./home-view";

/** Loads the learner's progress from the repository every time the screen gains focus. */
export function HomeContainer() {
  const { progressRepository, clock } = useAppServices();
  const router = useRouter();
  const [state, setState] = useState<HomeViewState>({ status: "loading" });

  const load = useCallback(() => {
    let active = true;
    Promise.all([
      progressRepository.getStreak(),
      progressRepository.getXp(),
      progressRepository.getPlacementResult(),
    ]).then(
      ([streak, xp, placement]) => {
        if (!active) return;
        setState({
          status: "ready",
          streakDays: isStreakAlive(streak, clock.today()) ? streak.current : 0,
          xp,
          level: placement?.level ?? null,
        });
      },
      (error: unknown) => {
        if (!active) return;
        console.error("Failed to load progress", error);
        setState({ status: "error" });
      },
    );
    return () => {
      active = false;
    };
  }, [progressRepository, clock]);

  useFocusEffect(load);

  return (
    <HomeView
      state={state}
      onStartPlacement={() => router.push("/placement")}
      onOpenReview={() => router.push("/review")}
      onOpenAbout={() => router.push("/about")}
    />
  );
}
