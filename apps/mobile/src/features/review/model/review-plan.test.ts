import type { Exercise } from "@english-learn/content";
import { corpus } from "@english-learn/content/corpus";
import { addDays, initialState, localDate, type ReviewState } from "@english-learn/domain";
import {
  allExercises,
  cloze,
  reading,
  sequenceRng,
  translateWrite,
  translationChoice,
  vocab,
  wordOrder,
} from "@/features/lesson/model/fixtures";
import type { LessonSummary } from "@/features/lesson/model/lesson-session";
import { completeSession } from "@/features/lesson/application/complete-session";
import { lessonItemIds } from "@/features/lesson/model/lesson-catalog";
import { createFakeRepository } from "@/testing/fake-progress-repository";
import { testRandomBytes } from "@/testing/random-bytes";
import {
  REVIEW_MAX_ITEMS,
  pendingReviewItems,
  pickReviewExercises,
  restrictToItems,
} from "./review-plan";

const today = localDate("2026-10-29");

function due(itemId: string, daysAgo = 0, lapses = 0): ReviewState {
  return { ...initialState(itemId, addDays(today, -daysAgo)), reps: 1, intervalDays: 1, lapses };
}

const notDue = (itemId: string): ReviewState => ({
  ...initialState(itemId, today),
  dueDate: addDays(today, 3),
});

describe("pendingReviewItems", () => {
  it("lists due items with a reviewable exercise, most overdue first", () => {
    const states = [
      due("a2.routine.wake-up", 1),
      due("a2.routine.breakfast", 4),
      notDue("a2.routine.go-to-bed"),
    ];

    expect(pendingReviewItems({ states, today, exercises: allExercises })).toEqual([
      "a2.routine.breakfast",
      "a2.routine.wake-up",
    ]);
  });

  it("skips items whose only exercise is a reading", () => {
    expect(
      pendingReviewItems({ states: [due("a2.routine.commute")], today, exercises: allExercises }),
    ).toEqual([]);
  });

  it(`caps the session at ${REVIEW_MAX_ITEMS} items`, () => {
    const exercises: Exercise[] = Array.from({ length: 30 }, (_, i) => ({
      ...vocab,
      id: `x.vocab-${i}`,
      itemIds: [`x.item-${i}`],
    }));
    const states = exercises.map((e) => due(e.itemIds[0] ?? ""));

    expect(pendingReviewItems({ states, today, exercises })).toHaveLength(REVIEW_MAX_ITEMS);
  });
});

describe("pendingReviewItems: items in their first steps first", () => {
  const mature = (n: number): ReviewState => ({
    ...initialState(`a2.routine.old-${String(n).padStart(2, "0")}`, addDays(today, -40)),
    reps: 4,
    intervalDays: 15,
    dueDate: addDays(today, -10),
  });
  const oldItems = Array.from({ length: 25 }, (_, n) => mature(n));
  const exercises: Exercise[] = [
    ...oldItems.map((s, n) => ({ ...vocab, id: `a2.routine.vocab-old-${n}`, itemIds: [s.itemId] })),
    vocab,
    cloze,
    translationChoice,
  ];

  it("plans yesterday's new items (interval ≤ 1 day) before an older backlog that fills the cap", () => {
    const fresh = [
      due("a2.routine.wake-up"),
      due("a2.routine.breakfast"),
      due("a2.routine.go-to-bed"),
    ];
    const plan = pendingReviewItems({ states: [...oldItems, ...fresh], today, exercises });

    expect(plan).toHaveLength(REVIEW_MAX_ITEMS);
    expect(plan.slice(0, 3)).toEqual([
      "a2.routine.breakfast",
      "a2.routine.go-to-bed",
      "a2.routine.wake-up",
    ]);
    expect(plan.slice(3)).toEqual(oldItems.slice(0, REVIEW_MAX_ITEMS - 3).map((s) => s.itemId));
  });

  it("counts a lapsed item (back to 1 day) as in its first steps too", () => {
    const lapsed = { ...mature(99), itemId: "a2.routine.usually", intervalDays: 1, lapses: 1 };
    const plan = pendingReviewItems({
      states: [...oldItems, { ...lapsed, dueDate: today }],
      today,
      exercises: [...exercises, wordOrder],
    });
    expect(plan[0]).toBe("a2.routine.usually");
  });
});

describe("a completed lesson's items, with the bundled content", () => {
  it("are all due for review the next day, reading-only ones included", async () => {
    const day1 = localDate("2030-01-01");
    const repository = createFakeRepository();
    const lesson = corpus.lessonsById.get("a2.weather.lesson-001")!;
    const itemIds = lessonItemIds(lesson, corpus.exercisesById);
    expect(itemIds).toContain("a2.weather.windy"); // only its reading practiced it before

    await completeSession({
      repository,
      today: day1,
      nowMs: 0,
      randomBytes: testRandomBytes,
      deviceId: "test-device",
      kind: "lesson",
      summary: {
        lessonId: lesson.id,
        verdicts: [],
        accuracy: 1,
        answerXp: 0,
        itemOutcomes: itemIds.map((itemId) => ({
          itemId,
          exerciseType: "vocab",
          verdict: "correct",
          responseMs: 1000,
        })),
      },
    });
    const states = await repository.getReviewStates();

    expect(pendingReviewItems({ states, today: day1, exercises: corpus.exercises })).toEqual([]);
    const nextDay = pendingReviewItems({
      states,
      today: addDays(day1, 1),
      exercises: corpus.exercises,
    });
    expect([...nextDay].sort()).toEqual([...itemIds].sort());
    expect(lesson.newItemIds?.every((id) => nextDay.includes(id))).toBe(true);
    const picked = pickReviewExercises({
      itemIds: nextDay,
      exercises: corpus.exercises,
      rng: () => 0,
    });
    for (const id of itemIds) expect(picked.some((e) => e.itemIds.includes(id))).toBe(true);
  });
});

describe("pickReviewExercises", () => {
  it("picks one exercise per due item and lets one exercise cover several due items", () => {
    // word order covers usually + wake-up; translate-write covers usually + go-to-bed.
    const picked = pickReviewExercises({
      itemIds: ["a2.routine.usually", "a2.routine.wake-up", "a2.routine.go-to-bed"],
      exercises: [wordOrder, translateWrite, reading],
      rng: () => 0,
    });

    expect(picked.map((e) => e.id)).toEqual([wordOrder.id, translateWrite.id]);
  });

  it("never picks a reading exercise", () => {
    const picked = pickReviewExercises({
      itemIds: ["a2.routine.commute"],
      exercises: [reading],
      rng: () => 0,
    });

    expect(picked).toEqual([]);
  });

  it("avoids repeating the previous exercise type when it can", () => {
    const vocabBreakfast = { ...vocab, id: "x.vocab-breakfast", itemIds: ["a2.routine.breakfast"] };
    const picked = pickReviewExercises({
      itemIds: ["a2.routine.wake-up", "a2.routine.breakfast"],
      exercises: [vocab, vocabBreakfast, cloze],
      rng: () => 0,
    });

    expect(picked.map((e) => e.type)).toEqual(["vocab", "cloze"]);
  });

  it("chooses among candidates with the injected rng (deterministic)", () => {
    const vocab2 = { ...vocab, id: "x.vocab-2" };
    const pick = (value: number) =>
      pickReviewExercises({
        itemIds: ["a2.routine.wake-up"],
        exercises: [vocab, vocab2, translationChoice],
        rng: sequenceRng([value]),
      }).map((e) => e.id);

    expect(pick(0)).toEqual([vocab.id]);
    expect(pick(0.99)).toEqual([vocab2.id]);
    expect(pick(0.99)).toEqual(pick(0.99));
  });
});

describe("restrictToItems", () => {
  it("keeps only the outcomes of the reviewed items", () => {
    const summary: LessonSummary = {
      lessonId: "review",
      verdicts: ["correct"],
      accuracy: 1,
      answerXp: 10,
      itemOutcomes: [
        { itemId: "due", exerciseType: "word_order", verdict: "correct", responseMs: 1 },
        { itemId: "not-due", exerciseType: "word_order", verdict: "correct", responseMs: 1 },
      ],
    };

    expect(restrictToItems(summary, ["due"]).itemOutcomes.map((o) => o.itemId)).toEqual(["due"]);
  });
});

describe("study card items", () => {
  // Card exercises are in no lesson, but they are in the corpus like every exercise.
  it("are planned and reviewed with the card's own practice exercises", () => {
    const card = corpus.cardsById.get("b1.grammar.look-forward-to")!;
    const states = card.itemIds.map((id) => due(id, 1));

    const itemIds = pendingReviewItems({ states, today, exercises: corpus.exercises });
    const picked = pickReviewExercises({ itemIds, exercises: corpus.exercises, rng: () => 0 });

    expect(itemIds).toEqual(card.itemIds);
    expect(picked.length).toBeGreaterThan(0);
    expect(picked.every((e) => card.exerciseIds.includes(e.id))).toBe(true);
  });
});
