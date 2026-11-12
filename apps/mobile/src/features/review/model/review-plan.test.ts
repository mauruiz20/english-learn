import type { Exercise, Level } from "@english-learn/content";
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
  hasDeferredReviewExercises,
  pendingReviewItems,
  pickReviewExercises,
  planReview,
  reviewContext,
  restrictToItems,
  reviewOutlook,
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

describe("daily review allowance", () => {
  const exercises: Exercise[] = Array.from({ length: 8 }, (_, i) => ({
    ...vocab,
    id: `daily.vocab-${i}`,
    itemIds: [`daily.item-${i}`],
  }));
  const states = exercises.map((exercise) => due(exercise.itemIds[0] ?? ""));

  it("serves only the exercises left in today's allowance and saves only covered items", () => {
    const plan = planReview({ states, today, exercises, remainingExercises: 3 });

    expect(plan.exercises).toHaveLength(3);
    expect(plan.itemIds).toHaveLength(3);
    expect(
      plan.itemIds.every((id) => plan.exercises.some((exercise) => exercise.itemIds.includes(id))),
    ).toBe(true);
  });

  it("serves nothing after today's 20 exercises are used, without changing the next day's plan", () => {
    expect(planReview({ states, today, exercises, remainingExercises: 0 })).toEqual({
      itemIds: [],
      exercises: [],
    });
    expect(planReview({ states, today, exercises, remainingExercises: 20 }).exercises).toHaveLength(
      8,
    );
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

/** Due states for the first `n` reviewable items of the bundled lessons, in lesson order. */
function dueCorpusStates(n: number): ReviewState[] {
  const ids = new Set<string>();
  for (const lesson of corpus.lessons) {
    for (const id of lessonItemIds(lesson, corpus.exercisesById)) {
      if (
        ids.size < n &&
        corpus.exercises.some((e) => e.type !== "reading" && e.itemIds.includes(id))
      )
        ids.add(id);
    }
  }
  return [...ids].map((id) => due(id));
}

describe("planReview and reviewOutlook: home says what the next review serves", () => {
  it.each([5, 20, 45])(
    "with %i due items, home's count is exactly the next session's exercises",
    (n) => {
      const states = dueCorpusStates(n);
      const input = { states, today, exercises: corpus.exercises };
      const plan = planReview(input);

      expect(planReview(input)).toEqual(plan);
      expect(reviewOutlook(input).next).toBe(plan.exercises.length);
      expect(plan.itemIds).toEqual(pendingReviewItems(input));
    },
  );

  it("counts the exercises, not the items, when one exercise reviews several due items", () => {
    // The owner's report: home said 20 (items) and the review served 18 (exercises).
    const states = dueCorpusStates(20);
    const input = { states, today, exercises: corpus.exercises };
    const plan = planReview(input);
    expect(plan.itemIds).toHaveLength(20);
    expect(plan.exercises.length).toBeLessThan(20);
    expect(reviewOutlook(input).next).toBe(plan.exercises.length);
  });

  it("says nothing remains when one session holds every due item", () => {
    const input = { states: dueCorpusStates(12), today, exercises: corpus.exercises };
    expect(reviewOutlook(input).later).toBe(0);
  });

  it("defers backlog beyond today's allowance without including it in today's sessions", () => {
    const states = dueCorpusStates(45);
    const input = { states, today, exercises: corpus.exercises };
    const { next, later } = reviewOutlook(input);
    expect(next + later).toBeLessThanOrEqual(20);
    expect(hasDeferredReviewExercises(input)).toBe(true);

    // Every session of the day, played in turn: the planned items leave today's due set.
    let left = states;
    let allowance = 20;
    const sizes: number[] = [];
    while (allowance > 0) {
      const plan = planReview({
        states: left,
        today,
        exercises: corpus.exercises,
        remainingExercises: allowance,
      });
      if (plan.exercises.length === 0) break;
      sizes.push(plan.exercises.length);
      allowance -= plan.exercises.length;
      left = left.filter((s) => !plan.itemIds.includes(s.itemId));
    }
    expect(sizes[0]).toBe(next);
    expect(sizes.slice(1).reduce((a, b) => a + b, 0)).toBe(later);
  });

  it("never counts items without a reviewable exercise", () => {
    const input = {
      states: [due("a2.routine.commute"), due("a2.routine.wake-up")],
      today,
      exercises: allExercises,
    };
    expect(planReview(input).itemIds).toEqual(["a2.routine.wake-up"]);
    expect(reviewOutlook(input)).toEqual({ next: 1, later: 0 });
  });

  it("serves nothing and counts nothing when nothing is due", () => {
    const input = { states: [notDue("a2.routine.wake-up")], today, exercises: allExercises };
    expect(planReview(input)).toEqual({ itemIds: [], exercises: [] });
    expect(reviewOutlook(input)).toEqual({ next: 0, later: 0 });
  });
});

describe("daily-cap deferred notice", () => {
  it("does not label naturally scheduled tomorrow reviews as deferred by the cap", () => {
    const input = {
      states: [{ ...due(vocab.itemIds[0]!), dueDate: addDays(today, 1) }],
      today,
      exercises: [vocab],
      remainingExercises: 20,
    };
    expect(reviewOutlook(input)).toEqual({ next: 0, later: 0 });
    expect(hasDeferredReviewExercises(input)).toBe(false);
  });
});

describe("today's wrong answers first", () => {
  const missed = "a2.routine.wake-up";
  const ordinary = "a2.routine.breakfast";
  const history = (grade: 1 | 5, day = today) => ({
    itemId: missed,
    lastSeen: day,
    lastLapse: null,
    recentGrades: [grade],
  });

  it("reviews a mistake from today's lesson before overdue items, even before its due date", () => {
    const input = {
      states: [due(ordinary, 4), notDue(missed)],
      today,
      exercises: allExercises,
      histories: [history(1)],
      remainingExercises: 1,
    };
    expect(planReview(input).itemIds).toContain(missed);
    expect(planReview(input).itemIds).not.toContain(ordinary);
    expect(planReview(input).exercises).toHaveLength(1);
  });

  it("fills the rest with due reviews and never exceeds the remaining daily allowance", () => {
    const input = {
      states: [due(ordinary, 4), notDue(missed)],
      today,
      exercises: allExercises,
      histories: [history(1)],
      remainingExercises: 2,
    };
    expect(planReview(input).itemIds).toEqual([missed, ordinary]);
    expect(reviewOutlook(input)).toEqual({ next: 2, later: 0 });
    expect(planReview({ ...input, remainingExercises: 0 }).exercises).toEqual([]);
  });

  it("stops giving an early item priority after a correct answer, but not just a date change", () => {
    const input = { states: [due(ordinary, 4), notDue(missed)], today, exercises: allExercises };
    expect(planReview({ ...input, histories: [history(5)] }).itemIds).toEqual([ordinary]);
    expect(planReview({ ...input, histories: [history(1, addDays(today, -1))] }).itemIds).toEqual([
      missed,
      ordinary,
    ]);
  });
});

describe("unresolved mistakes and current-level priority", () => {
  const basic = Array.from({ length: 20 }, (_, index) => `a1.probe.basic-${index}`);
  const advanced = "b2.probe.advanced";
  const middle = "b1.probe.middle";
  const exercises = [...basic, advanced, middle].map((itemId, index) => ({
    ...vocab,
    id: `probe.exercise-${index}`,
    itemIds: [itemId],
  }));
  const itemsById = new Map<string, { level: Level }>([
    ...basic.map((id) => [id, { level: "A1" as const }] as const),
    [advanced, { level: "B2" as const }] as const,
    [middle, { level: "B1" as const }] as const,
  ]);
  const input = {
    states: [...basic.map((id) => due(id, 10)), due(advanced), due(middle)],
    today,
    exercises,
    itemsById,
    level: "B2" as const,
  };
  it.each([1, 4])(
    "keeps an unresolved mistake from %i days ago ahead of a full basic backlog",
    (daysAgo) => {
      const plan = planReview({
        ...input,
        remainingExercises: 1,
        histories: [
          {
            itemId: advanced,
            lastSeen: addDays(today, -daysAgo),
            lastLapse: addDays(today, -daysAgo),
            recentGrades: [1],
          },
        ],
      });
      expect(plan.itemIds).toEqual([advanced]);
      expect(plan.exercises).toHaveLength(1);
    },
  );
  it("fills the daily allowance with studied current-level items before much lower levels, without adding unseen content", () => {
    const plan = planReview(input);
    expect(plan.itemIds.slice(0, 2)).toEqual([advanced, middle]);
    expect(plan.exercises).toHaveLength(20);
    expect(plan.itemIds.every((id) => input.states.some((state) => state.itemId === id))).toBe(
      true,
    );
    expect(planReview({ ...input, remainingExercises: 0 }).exercises).toEqual([]);
  });
  it("still puts unresolved lower-level errors before correct advanced items", () => {
    const missed = basic[19]!;
    expect(
      planReview({
        ...input,
        remainingExercises: 1,
        histories: [
          { itemId: missed, lastSeen: addDays(today, -1), lastLapse: null, recentGrades: [1] },
        ],
      }).itemIds,
    ).toEqual([missed]);
  });
});

it("preserves SRS tie ordering when a fixture lacks item metadata but its exercises have a level", () => {
  const states = [due("a2.routine.wake-up"), due("a2.routine.breakfast")];
  expect(
    planReview({
      states,
      today,
      exercises: allExercises,
      level: "A2",
      itemsById: new Map([["a2.routine.wake-up", { level: "A2" }]]),
    }).itemIds,
  ).toEqual(["a2.routine.breakfast", "a2.routine.wake-up"]);
});

it("derives the review level from the existing automatic course progression", () => {
  expect(reviewContext(corpus, "B2", []).level).toBe("B2");
  const learned = new Set(
    corpus.lessons
      .filter((lesson) => lesson.level === "B2")
      .flatMap((lesson) =>
        lesson.exerciseIds.flatMap((id) => corpus.exercisesById.get(id)?.itemIds ?? []),
      ),
  );
  expect(
    reviewContext(
      corpus,
      "B2",
      [...learned].map((id) => initialState(id, today)),
    ).level,
  ).toBe("C1");
});
