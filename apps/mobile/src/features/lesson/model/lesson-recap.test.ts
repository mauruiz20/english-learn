import { createCorpus, type Lesson } from "@english-learn/content";
import { corpus } from "@english-learn/content/corpus";
import { allExercises, cloze, lesson, passage, translationChoice, wordOrder } from "./fixtures";
import { annotateText } from "@english-learn/domain";
import { itemEntryIds } from "@/features/glossary/model/item-entries";
import { lessonItemIds } from "./lesson-catalog";
import { lessonRecap, recapItemIds } from "./lesson-recap";

const items = [
  { id: "a2.routine.wake-up", term: "wake up", es: "despertarse" },
  { id: "a2.routine.breakfast", term: "have breakfast", es: "desayunar" },
  { id: "a2.routine.usually", term: "usually", es: "normalmente" },
  { id: "a2.routine.go-to-bed", term: "go to bed", es: "acostarse" },
  { id: "a2.routine.commute", term: "commute", es: "trayecto al trabajo" },
].map((i) => ({ ...i, level: "A2" as const, topics: ["routine"], kind: "word" as const }));

const second: Lesson = {
  ...lesson,
  id: "a2.routine.lesson-002",
  exerciseIds: [translationChoice.id, cloze.id, wordOrder.id, cloze.id, cloze.id],
};

const content = createCorpus([
  { items, exercises: allExercises, passages: [passage], lessons: [lesson, second] },
]);

describe("recapItemIds", () => {
  it("uses the lesson's newItemIds when it lists them", () => {
    const listed = { ...lesson, newItemIds: ["a2.routine.usually", "a2.routine.wake-up", "x"] };
    expect(recapItemIds(listed, content)).toEqual(listed.newItemIds);
  });

  it("derives the items no earlier lesson practices, in order, at most five", () => {
    expect(recapItemIds(lesson, content)).toEqual(lessonItemIds(lesson, content.exercisesById));
    // Everything lesson-002 practices came up in lesson-001 already: nothing is new.
    expect(recapItemIds(second, content)).toEqual([]);
  });
});

describe("lessonRecap", () => {
  it("links an item to the study card that teaches it, without an inline explanation", () => {
    const real = corpus.lessonsById.get("a2.daily-routine.lesson-001")!;
    const wakeUp = lessonRecap(real, corpus).find((i) => i.id === "a2.daily-routine.wake-up");
    const card = corpus.cards.find((c) => c.itemIds.includes("a2.daily-routine.wake-up"))!;
    expect(wakeUp).toEqual({
      id: "a2.daily-routine.wake-up",
      term: "wake up",
      es: "despertarse",
      card: { id: card.id, title: card.title },
    });
  });

  it("explains an item without a card with its meaning and an example from the lesson", () => {
    const recap = lessonRecap({ ...lesson, newItemIds: ["a2.routine.go-to-bed"] }, content);
    expect(recap).toEqual([
      {
        id: "a2.routine.go-to-bed",
        term: "go to bed",
        es: "acostarse",
        example: { en: "She goes to bed at eleven.", es: "Ella se acuesta a las once." },
      },
    ]);
  });

  it("fills a cloze blank with its first answer for the example", () => {
    const [breakfast] = lessonRecap({ ...lesson, newItemIds: ["a2.routine.breakfast"] }, content);
    expect(breakfast?.example).toEqual({
      en: "I usually have breakfast at seven.",
      es: "Normalmente desayuno a las siete.",
    });
  });

  it("prefers the example the content gives the item", () => {
    const example = { en: "I go to bed early.", es: "Me acuesto temprano." };
    const withExample = createCorpus([
      {
        items: items.map((i) => (i.id === "a2.routine.go-to-bed" ? { ...i, example } : i)),
        exercises: allExercises,
        passages: [passage],
        lessons: [lesson],
      },
    ]);
    const [item] = lessonRecap({ ...lesson, newItemIds: ["a2.routine.go-to-bed"] }, withExample);
    expect(item?.example).toEqual(example);
  });

  it("skips ids the corpus does not know", () => {
    expect(lessonRecap({ ...lesson, newItemIds: ["a2.routine.nope"] }, content)).toEqual([]);
  });

  describe("with the bundled content", () => {
    it.each(corpus.lessons.map((l) => [l.id, l] as const))(
      "%s recaps 3 to 5 items, each with a card or a meaning and an example",
      (_, real) => {
        const recap = lessonRecap(real, corpus);
        expect(recap.length).toBeGreaterThanOrEqual(3);
        expect(recap.length).toBeLessThanOrEqual(5);
        for (const item of recap) {
          if (item.card !== undefined) continue;
          expect(item.es.length).toBeGreaterThan(0);
          expect(item.example?.en).toMatch(/^[A-Z0-9"'¿¡]/u);
          expect(item.example?.en).not.toContain("___");
          expect(item.example?.es?.length).toBeGreaterThan(0);
          // The sentence really uses the word or phrase: it links the item's glossary entry, or
          // has all its words (a separated phrasal verb: "pay you back"). Grammar items and
          // terms without an entry are not checked.
          const entries = itemEntryIds(item.term, corpus.glossaryIndex);
          if (corpus.itemsById.get(item.id)?.kind === "grammar" || entries.length === 0) continue;
          const en = item.example!.en;
          const linked = annotateText(en, corpus.glossaryIndex).map((s) => s.entryId);
          const words = en.toLowerCase().split(/[^a-z']+/u);
          const hasWords = item.term.split(" ").every((w) => words.includes(w.toLowerCase()));
          expect(entries.some((e) => linked.includes(e)) || hasWords).toBe(true);
        }
      },
    );
  });
});
