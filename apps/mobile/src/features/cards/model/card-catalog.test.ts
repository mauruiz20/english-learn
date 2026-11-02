import { corpus } from "@english-learn/content/corpus";
import { initialState, localDate, type ReviewState } from "@english-learn/domain";
import {
  cardByExerciseId,
  cardExercises,
  cardGroups,
  cardStatus,
  cardsSummary,
} from "./card-catalog";

const today = localDate("2030-01-01");
const card = corpus.cardsById.get("b1.grammar.look-forward-to")!;

/** A state that was reviewed once (interval 1) or reached `intervalDays`. */
function reviewed(itemId: string, intervalDays = 1): ReviewState {
  return { ...initialState(itemId, today), reps: 1, intervalDays };
}

describe("cardStatus", () => {
  it("is new while some of its items were never reviewed", () => {
    expect(cardStatus(card, [])).toBe("new");
  });

  it("is studied once every item it teaches has a review state", () => {
    expect(
      cardStatus(
        card,
        card.itemIds.map((id) => reviewed(id)),
      ),
    ).toBe("studied");
  });

  it("is studied even when an item was answered wrong (fresh state, due tomorrow)", () => {
    const fresh = card.itemIds.map((id) => initialState(id, today));
    expect(cardStatus(card, fresh)).toBe("studied");
  });

  it("is mastered once every item reached the mastery interval (21 days)", () => {
    const states = card.itemIds.map((id) => reviewed(id, 21));
    expect(cardStatus(card, states)).toBe("mastered");
    const almost = [reviewed(card.itemIds[0]!, 20), ...states.slice(1)];
    expect(cardStatus(card, almost)).toBe("studied");
  });
});

describe("cardGroups", () => {
  it("groups the cards by kind (grammar, phrasal verbs, vocabulary), then by level", () => {
    const groups = cardGroups(corpus.cards, []);

    expect(groups.map((g) => g.label)).toEqual(["Gramática", "Phrasal verbs", "Vocabulario"]);
    expect(groups.map((g) => g.topic)).toEqual(["grammar", "phrasal-verbs", "vocabulary"]);
    expect(groups[0]!.levels.map((l) => l.level)).toEqual(["A2", "B1", "B2"]);
    const rows = groups.flatMap((g) => g.levels.flatMap((l) => l.cards));
    expect(rows).toHaveLength(corpus.cards.length);
    expect(rows.find((r) => r.id === card.id)).toEqual({
      id: card.id,
      title: "Look forward to + -ing",
      level: "B1",
      status: "new",
    });
  });

  it("marks each card with its status", () => {
    const groups = cardGroups(
      corpus.cards,
      card.itemIds.map((id) => reviewed(id)),
    );
    const rows = groups.flatMap((g) => g.levels.flatMap((l) => l.cards));

    expect(rows.filter((r) => r.status !== "new").map((r) => r.id)).toEqual([card.id]);
  });
});

describe("cardsSummary", () => {
  it("counts the cards and the studied ones (mastered included)", () => {
    const other = corpus.cardsById.get("b2.grammar.be-worth")!;
    const states = [
      ...card.itemIds.map((id) => reviewed(id)),
      ...other.itemIds.map((id) => reviewed(id, 30)),
    ];

    expect(cardsSummary(corpus.cards, states)).toEqual({ total: corpus.cards.length, studied: 2 });
  });
});

describe("cardExercises", () => {
  it("lists the card's practice exercises in order", () => {
    const exercises = cardExercises(card, corpus.exercisesById);

    expect(exercises.map((e) => e.id)).toEqual(card.exerciseIds);
    expect(exercises.length).toBeGreaterThanOrEqual(6);
  });
});

describe("cardByExerciseId", () => {
  it("finds the card of its own practice exercises", () => {
    expect(cardByExerciseId(corpus).get(card.exerciseIds[0]!)).toEqual({
      id: card.id,
      title: card.title,
    });
  });

  it("finds the card that teaches an item a lesson exercise practices", () => {
    // "Mi rutina diaria" practices the daily-routine phrasal verbs.
    expect(cardByExerciseId(corpus).get("a2.daily-routine.vocab-001")?.id).toBe(
      "a2.phrasal-verbs.daily-routine",
    );
  });

  it("finds nothing for an exercise whose items no card teaches", () => {
    const exercise = corpus.exercises.find(
      (e) => !corpus.cards.some((c) => e.itemIds.some((id) => c.itemIds.includes(id))),
    )!;
    expect(cardByExerciseId(corpus).get(exercise.id)).toBeUndefined();
  });

  it("is built once per corpus", () => {
    expect(cardByExerciseId(corpus)).toBe(cardByExerciseId(corpus));
  });
});

describe("card ids", () => {
  it("never equal a lesson id (card practice is saved as a lesson with the card's id)", () => {
    const lessonIds = new Set(corpus.lessons.map((l) => l.id));
    expect(corpus.cards.filter((c) => lessonIds.has(c.id))).toEqual([]);
  });
});
