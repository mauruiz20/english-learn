import type { Corpus } from "@english-learn/content";
import { corpus } from "@english-learn/content/corpus";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { useProgressVersion } from "@/features/account/account-context";
import { GlossaryProvider } from "@/features/glossary/glossary-provider";
import { topicHighlighter } from "@/features/topics/topic-colors";
import { useAppServices } from "@/infrastructure/services/app-services";
import { SessionMessage } from "@/features/lesson/components/session-screens";
import { cardPracticePath } from "./card-routes";
import { CardView } from "./card-view";
import type { LessonScore } from "@/features/lesson/model/lesson-score";
import { cardScores, cardStatus, type CardStatus } from "./model/card-catalog";

/**
 * `/fichas/[id]`: one study card, with English words to look up (no SRS signal: nothing is being
 * graded here), whether the learner studied it and its best practice result ("Practicar de
 * nuevo" then: answer XP only, the completion bonus was paid once). `fromSession`: opened from a
 * session's feedback, so it offers to go back to it.
 */
export function CardContainer({
  cardId,
  fromSession = false,
  content = corpus,
}: {
  cardId: string;
  fromSession?: boolean;
  content?: Corpus;
}) {
  const { progressRepository } = useAppServices();
  const router = useRouter();
  const card = content.cardsById.get(cardId);
  const [status, setStatus] = useState<CardStatus | null>(null);
  const [score, setScore] = useState<LessonScore | undefined>(undefined);
  const progressVersion = useProgressVersion();

  const load = useCallback(() => {
    let active = true;
    if (card === undefined) return undefined;
    Promise.all([progressRepository.getReviewStates(), progressRepository.getLessonResults()]).then(
      ([states, results]) => {
        if (!active) return;
        setStatus(cardStatus(card, states));
        setScore(
          cardScores({ cards: [card], exercisesById: content.exercisesById }, results).get(card.id),
        );
      },
      // The card reads fine without its status.
      (error: unknown) => console.error("Failed to load the card's progress", error),
    );
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progressRepository, card, content, progressVersion]);

  useFocusEffect(load);

  const back = () => (router.canGoBack() ? router.back() : router.replace("/fichas"));
  if (card === undefined) {
    return (
      <SessionMessage
        title="Ficha"
        text="No encontramos esta ficha."
        onGoHome={() => router.replace("/")}
      />
    );
  }
  return (
    <GlossaryProvider index={content.glossaryIndex} tint={topicHighlighter(card.topic)}>
      <CardView
        card={card}
        status={status}
        score={score}
        fromSession={fromSession}
        onPractice={() => router.push(cardPracticePath(card.id))}
        onBack={back}
      />
    </GlossaryProvider>
  );
}
