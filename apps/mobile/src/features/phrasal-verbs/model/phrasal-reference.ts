import type { Corpus } from "@english-learn/content";
import { topicLabel } from "@/features/topics/topic-labels";

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
  const groups = [...practice, ...cards];
  for (const source of SUPPLEMENTAL_ITEMS) {
    const item = content.itemsById.get(source.id);
    if (!item?.example) continue;
    const entry = {
      id: item.id,
      verb: source.verb ?? item.term,
      es: item.es,
      example: item.example,
    };
    const title = topicLabel(source.topic);
    const index = groups.findIndex(
      (group) => group.title.toLocaleLowerCase("es") === title.toLocaleLowerCase("es"),
    );
    const existing = groups[index];
    if (existing) groups[index] = { ...existing, entries: [...existing.entries, entry] };
    else groups.push({ id: `reference.${source.topic}`, title, entries: [entry] });
  }
  return groups;
}

// Audited course senses outside the phrasal-card/practice categories. IDs preserve distinct meanings.
const SUPPLEMENTAL_ITEMS: readonly { id: string; topic: string; verb?: string }[] = [
  { id: "a2.family.look-like", topic: "family" },
  { id: "a2.free-time.go-out", topic: "free-time" },
  { id: "a2.shopping.try-on", topic: "shopping" },
  { id: "a2.work.look-for", topic: "work" },
  { id: "a2.situations.walk-past", topic: "directions" },
  {
    id: "b1.culture-and-entertainment.look-forward",
    topic: "culture-and-entertainment",
    verb: "look forward to",
  },
  { id: "b1.environment.throw-away", topic: "environment" },
  { id: "b1.media-and-news.find-out", topic: "media-and-news" },
  { id: "b1.money-and-shopping.pay-back", topic: "money-and-shopping" },
  { id: "b1.money-and-shopping.save-up", topic: "money-and-shopping" },
  { id: "b1.travel.set-off", topic: "travel" },
  { id: "b2.lifelong-learning.pick-up", topic: "lifelong-learning" },
  { id: "b2.lifelong-learning.brush-up-on", topic: "lifelong-learning" },
  { id: "b2.lifelong-learning.keep-up-with", topic: "lifelong-learning" },
  { id: "c1.law-and-ethics.speak-out", topic: "law-and-ethics" },
];
