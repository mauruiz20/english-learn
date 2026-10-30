import type { Exercise } from "@english-learn/content";
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
