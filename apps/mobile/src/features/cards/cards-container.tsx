import type { Corpus } from "@english-learn/content";
import { corpus } from "@english-learn/content/corpus";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { useProgressVersion } from "@/features/account/account-context";
import { useAppServices } from "@/infrastructure/services/app-services";
import { cardPath } from "./card-routes";
import { CardsView, type CardsViewState } from "./cards-view";
import { cardGroups, cardScores, cardsSummary } from "./model/card-catalog";

/**
 * `/fichas`: the study cards with what the learner studied and each one's best practice result,
 * reloaded every time it gains focus.
 */
export function CardsContainer({ content = corpus }: { content?: Corpus }) {
  const { progressRepository } = useAppServices();
  const router = useRouter();
  const [state, setState] = useState<CardsViewState>({ status: "loading" });
  const progressVersion = useProgressVersion();

  const load = useCallback(() => {
    let active = true;
    Promise.all([progressRepository.getReviewStates(), progressRepository.getLessonResults()]).then(
      ([states, results]) =>
        active &&
        setState({
          status: "ready",
          groups: cardGroups(content.cards, states, cardScores(content, results)),
          ...cardsSummary(content.cards, states),
        }),
      (error: unknown) => {
        if (!active) return;
        console.error("Failed to load the study cards", error);
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

  return <CardsView state={state} onOpenCard={(id) => router.push(cardPath(id))} />;
}
