import type { Corpus } from "@english-learn/content";
import { corpus } from "@english-learn/content/corpus";
import { useRouter } from "expo-router";
import { PracticeSession } from "@/features/lesson/lesson-container";
import type { SessionCopy } from "@/features/lesson/lesson-view";
import { cardPath } from "./card-routes";
import { cardExercises } from "./model/card-catalog";

const PRACTICE_COPY: SessionCopy = {
  name: "Práctica",
  notFound: "No encontramos esta ficha.",
  completed: "¡Práctica completada!",
  done: "Volver a la ficha",
};

/**
 * Practices a study card's exercises with the lesson flow and saves them like a lesson whose id
 * is the card's (answer XP, the first-time completion bonus, items into spaced repetition).
 * Card ids never equal lesson ids, and home and the album count lessons from the content, so a
 * practiced card never shows as a lesson done.
 */
export function CardPracticeContainer({
  cardId,
  content = corpus,
}: {
  cardId: string;
  content?: Corpus;
}) {
  const router = useRouter();
  const card = content.cardsById.get(cardId);
  const unit =
    card === undefined
      ? null
      : {
          info: { id: card.id, title: card.title },
          topic: card.topic,
          exercises: cardExercises(card, content.exercisesById),
          kind: "card" as const,
        };
  return (
    <PracticeSession
      unit={unit}
      content={content}
      copy={PRACTICE_COPY}
      leaveTitle="¿Salir de la práctica?"
      onDone={() => (router.canGoBack() ? router.back() : router.replace(cardPath(cardId)))}
    />
  );
}
