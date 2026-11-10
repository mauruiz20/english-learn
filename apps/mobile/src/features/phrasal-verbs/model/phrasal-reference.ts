import type { Corpus } from "@english-learn/content";

export type ReferenceEntry = {
  readonly id: string;
  readonly verb: string;
  readonly es: string;
  readonly example: { readonly en: string; readonly es: string };
};
export type ReferenceGroup = {
  readonly id: string;
  readonly title: string;
  readonly entries: readonly ReferenceEntry[];
};

/** A read-only projection of authored examples; never derives text from exercise distractors. */
export function phrasalReference(content: Corpus): ReferenceGroup[] {
  const cards = content.cards.flatMap((card): ReferenceGroup[] =>
    card.kind === "phrasal_verbs"
      ? [
          {
            id: card.id,
            title: card.title.replace(/^Phrasal verbs:\s*/i, ""),
            entries: card.entries.map((entry, index) => ({
              id: `${card.id}:${index}`,
              verb: entry.verb,
              es: entry.es,
              example: entry.example,
            })),
          },
        ]
      : [],
  );
  const collection = content.practice.find((entry) => entry.id === "practice.phrasal-verbs");
  const practice = (collection?.groups ?? []).flatMap((group): ReferenceGroup[] => {
    if (!("lessonIds" in group)) return [];
    const itemIds = new Set(
      group.lessonIds.flatMap((id) => {
        const lesson = content.practiceLessonsById.get(id);
        return (
          lesson?.exerciseIds.flatMap(
            (exerciseId) => content.exercisesById.get(exerciseId)?.itemIds ?? [],
          ) ?? []
        );
      }),
    );
    const entries = [...itemIds].flatMap((id): ReferenceEntry[] => {
      const item = content.itemsById.get(id);
      return item?.example ? [{ id, verb: item.term, es: item.es, example: item.example }] : [];
    });
    return entries.length ? [{ id: group.id, title: group.title, entries }] : [];
  });
  return [...practice, ...cards];
}
