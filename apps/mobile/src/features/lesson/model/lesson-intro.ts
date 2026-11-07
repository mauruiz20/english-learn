import type { Corpus, Lesson, LessonIntro } from "@english-learn/content";

/** How many of a card's uses become points of a derived intro. */
const DERIVED_POINTS = 3;

/**
 * The theory shown before a lesson's first exercise ("Antes de empezar"): the lesson's own
 * `intro`, or else one derived from its first linked card (`deepenCardIds`): the card's first
 * uses as points, its first example and its first pitfall as the mistake. Null when the lesson
 * has neither (it shows no intro).
 */
export function lessonIntro(
  lesson: Lesson,
  content: Pick<Corpus, "cardsById">,
): LessonIntro | null {
  if (lesson.intro !== undefined) return lesson.intro;
  const card = (lesson.deepenCardIds ?? [])
    .map((id) => content.cardsById.get(id))
    .find((c) => c !== undefined);
  if (card === undefined) return null;
  const pitfall = card.pitfalls[0];
  return {
    points: card.uses.slice(0, DERIVED_POINTS),
    examples: card.examples.slice(0, 1),
    ...(pitfall === undefined
      ? {}
      : { mistake: { wrong: pitfall.wrong, right: pitfall.right, note: pitfall.why } }),
  };
}
