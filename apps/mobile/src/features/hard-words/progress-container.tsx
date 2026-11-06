import type { Corpus } from "@english-learn/content";
import { corpus } from "@english-learn/content/corpus";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { useProgressVersion } from "@/features/account/account-context";
import { cardPath } from "@/features/cards/card-routes";
import { useAppServices } from "@/infrastructure/services/app-services";
import { reviewPlanRng } from "@/features/review/model/review-plan";
import { planHardPractice, progressOverview } from "./model/hard-words";
import { ProgressView, type ProgressViewState } from "./progress-view";

/** Where the hard-words practice plays. */
export const HARD_PRACTICE_PATH = "/progreso/practicar";

/**
 * `/progreso`: the buckets of the reviewed words and the difficult ones, reloaded every time it
 * gains focus (so the counts are fresh after a practice).
 */
export function ProgressContainer({ content = corpus }: { content?: Corpus }) {
  const { progressRepository, clock } = useAppServices();
  const router = useRouter();
  const [state, setState] = useState<ProgressViewState>({ status: "loading" });
  const progressVersion = useProgressVersion();

  const load = useCallback(() => {
    let active = true;
    Promise.all([progressRepository.getReviewStates(), progressRepository.getItemHistories()]).then(
      ([states, histories]) => {
        if (!active) return;
        const overview = progressOverview({ states, histories, content });
        // Whether any exercise can practice them (the picks themselves do not matter here).
        const plan = planHardPractice({
          hardItemIds: overview.hardWords.map((w) => w.itemId),
          exercises: content.exercises,
          rng: reviewPlanRng(clock.today()),
        });
        setState({ status: "ready", ...overview, canPractice: plan.exercises.length > 0 });
      },
      (error: unknown) => {
        if (!active) return;
        console.error("Failed to load the progress overview", error);
        setState({ status: "error" });
      },
    );
    return () => {
      active = false;
    };
    // `progressVersion` reloads after a sync brought progress from another device.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progressRepository, content, progressVersion]);

  useFocusEffect(load);

  return (
    <ProgressView
      state={state}
      onPractice={() => router.push(HARD_PRACTICE_PATH)}
      onOpenCard={(cardId) => router.push(cardPath(cardId))}
    />
  );
}
