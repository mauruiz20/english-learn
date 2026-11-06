import { createCorpus, type Item } from "@english-learn/content";
import { DEFAULT_EASE, localDate, type ItemHistory, type ReviewState } from "@english-learn/domain";
import {
  card,
  cloze,
  reading,
  sequenceRng,
  translationChoice,
  vocab,
  wordOrder,
} from "@/features/lesson/model/fixtures";
import {
  HARD_PRACTICE_MAX_EXERCISES,
  hardPracticeNote,
  planHardPractice,
  progressOverview,
} from "./hard-words";

const today = localDate("2026-10-29");

const item = (id: string, term: string, es: string): Item => ({
  id,
  level: "A2",
  topics: ["routine"],
  kind: "word",
  term,
  es,
});

const content = createCorpus([
  {
    items: [
      item("a2.routine.wake-up", "wake up", "despertarse"),
      item("a2.routine.usually", "usually", "normalmente"),
      item("a2.routine.breakfast", "have breakfast", "desayunar"),
      item("a2.routine.go-to-bed", "go to bed", "acostarse"),
      item("a2.routine.commute", "commute (to work)", "ir al trabajo"),
    ],
    exercises: [vocab, cloze, wordOrder, translationChoice],
    cards: [card],
  },
]);

function state(itemId: string, overrides: Partial<ReviewState> = {}): ReviewState {
  return {
    itemId,
    ease: DEFAULT_EASE,
    intervalDays: 6,
    reps: 2,
    lapses: 0,
    dueDate: today,
    ...overrides,
  };
}

function history(itemId: string, recentGrades: ItemHistory["recentGrades"]): ItemHistory {
  return { itemId, lastSeen: today, lastLapse: null, recentGrades };
}

describe("progressOverview", () => {
  const states = [
    state("a2.routine.wake-up", { lapses: 1 }),
    state("a2.routine.usually", { intervalDays: 30 }),
    state("a2.routine.breakfast"),
    state("a2.routine.go-to-bed", { lapses: 3 }),
    state("unknown.item", { lapses: 4 }),
  ];
  const histories = [
    history("a2.routine.wake-up", [5, 1]),
    history("a2.routine.go-to-bed", [1, 2]),
    history("unknown.item", [1]),
  ];

  it("counts the buckets of the items the content knows", () => {
    expect(progressOverview({ states, histories, content }).counts).toEqual({
      mastered: 1,
      learning: 1,
      hard: 2,
    });
  });

  it("lists the difficult words hardest first, with meaning, speech and their card", () => {
    expect(progressOverview({ states, histories, content }).hardWords).toEqual([
      {
        itemId: "a2.routine.go-to-bed",
        term: "go to bed",
        es: "acostarse",
        speakText: "go to bed",
        card: undefined,
        lapses: 3,
        recentAccuracy: 0,
      },
      {
        itemId: "a2.routine.wake-up",
        term: "wake up",
        es: "despertarse",
        speakText: "wake up",
        card: { id: card.id, title: card.title },
        lapses: 1,
        recentAccuracy: 0.5,
      },
    ]);
  });

  it("says terms without their notation", () => {
    const overview = progressOverview({
      states: [state("a2.routine.commute", { ease: 1.3 })],
      histories: [],
      content,
    });
    expect(overview.hardWords[0]?.speakText).toBe("commute");
  });
});

describe("planHardPractice", () => {
  it("practices the difficult items in order, one exercise per item, saving only those", () => {
    const plan = planHardPractice({
      hardItemIds: ["a2.routine.breakfast", "a2.routine.wake-up"],
      exercises: [vocab, cloze, wordOrder, reading],
      rng: sequenceRng([0]),
    });
    expect(plan.exercises.map((e) => e.id)).toEqual([cloze.id, vocab.id]);
    expect(plan.itemIds).toEqual(["a2.routine.breakfast", "a2.routine.wake-up"]);
  });

  it("skips items no reviewable exercise practices", () => {
    const plan = planHardPractice({
      hardItemIds: ["a2.routine.commute", "a2.routine.wake-up"],
      exercises: [vocab, reading],
      rng: sequenceRng([0]),
    });
    expect(plan.itemIds).toEqual(["a2.routine.wake-up"]);
  });

  it(`serves at most ${HARD_PRACTICE_MAX_EXERCISES} exercises and saves only the items they cover`, () => {
    const exercises = Array.from({ length: 14 }, (_, i) => ({
      ...vocab,
      id: `a2.x.vocab-${i}`,
      itemIds: [`a2.x.item-${i}`],
    }));
    const plan = planHardPractice({
      hardItemIds: exercises.map((e) => e.itemIds[0]!),
      exercises,
      rng: sequenceRng([0]),
    });
    expect(HARD_PRACTICE_MAX_EXERCISES).toBe(10);
    expect(plan.exercises).toHaveLength(10);
    expect(plan.itemIds).toEqual(exercises.slice(0, 10).map((e) => e.itemIds[0]));
  });

  it("does not save other items an exercise also practices", () => {
    const plan = planHardPractice({
      hardItemIds: ["a2.routine.wake-up"],
      exercises: [wordOrder],
      rng: sequenceRng([0]),
    });
    expect(plan.itemIds).toEqual(["a2.routine.wake-up"]);
  });
});

describe("hardPracticeNote", () => {
  it("says how many difficult words left Difíciles", () => {
    expect(hardPracticeNote({ practiced: 5, movedOut: 3 })).toBe(
      "3 de 5 palabras difíciles avanzaron a En proceso.",
    );
    expect(hardPracticeNote({ practiced: 1, movedOut: 1 })).toBe(
      "1 de 1 palabra difícil avanzó a En proceso.",
    );
    expect(hardPracticeNote({ practiced: 4, movedOut: 1 })).toBe(
      "1 de 4 palabras difíciles avanzó a En proceso.",
    );
    expect(hardPracticeNote({ practiced: 2, movedOut: 0 })).toBe(
      "Tus palabras siguen en Difíciles: vuelve a practicarlas pronto.",
    );
    expect(hardPracticeNote({ practiced: 0, movedOut: 0 })).toBeUndefined();
  });
});
