import type { Exercise } from "@english-learn/content";
import { corpus } from "@english-learn/content/corpus";
import {
  card,
  cloze,
  reading,
  translateWrite,
  translationChoice,
  vocab,
  wordOrder,
} from "./fixtures";
import { gradeExercise } from "./grade-exercise";
import {
  isListenExercise,
  listenSource,
  listeningPool,
  mixListening,
  MAX_LISTENING_PER_SESSION,
  type ListenExercise,
} from "./listen-exercise";
import { finalGrades } from "./final-grades";
import { canDispute, lessonSessionReducer, startLesson } from "./lesson-session";
import { prepareExercise } from "./prepare-exercise";

/** A deterministic rng: a fixed sequence (Mulberry32). */
function rngFrom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const wo = (id: string, sentence: string): Exercise => ({
  ...wordOrder,
  id,
  tokens: sentence.split(" ").reverse(),
  accepted: [sentence],
});

const pool = listeningPool({ exercises: corpus.exercises, cards: corpus.cards });

describe("listenSource", () => {
  it("takes a word_order sentence and its accepted variants", () => {
    expect(listenSource(wo("x", "She usually has lunch at home."))).toEqual({
      sentence: "She usually has lunch at home.",
      answers: ["She usually has lunch at home."],
    });
  });

  it("takes a translate_write reference answer and every sentence its patterns stand for", () => {
    const source = listenSource({
      ...translateWrite,
      accepted: ["I {usually|normally} go to bed late."],
    });
    expect(source?.sentence).toBe("I usually go to bed late.");
    expect(source?.answers).toEqual(["I usually go to bed late.", "I normally go to bed late."]);
  });

  it("skips sentences that are too short, too long or have digits (said as words)", () => {
    expect(listenSource(wo("x", "Wake up."))).toBeNull();
    expect(listenSource(wo("x", "I usually go to bed at 11 p.m."))).toBeNull();
    expect(
      listenSource(
        wo(
          "x",
          "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen",
        ),
      ),
    ).toBeNull();
  });

  it("skips every other type", () => {
    for (const e of [vocab, cloze, translationChoice, reading] as Exercise[]) {
      expect(listenSource(e)).toBeNull();
    }
  });
});

describe("listeningPool", () => {
  it("collects sentences from word_order, translate_write answers and card examples", () => {
    const texts = listeningPool({
      exercises: [wo("a", "She usually has lunch at home."), translateWrite, vocab],
      cards: [card],
    }).map((s) => s.text);
    expect(texts).toContain("She usually has lunch at home.");
    expect(texts).toContain("I usually go to bed at eleven.");
    for (const example of card.examples) expect(texts).toContain(example.en);
  });

  it("comes from the real corpus and has no duplicates", () => {
    expect(pool.length).toBeGreaterThan(100);
    expect(new Set(pool.map((s) => s.text.toLowerCase())).size).toBe(pool.length);
  });
});

describe("mixListening", () => {
  const session = [
    vocab,
    wo("a2.o1", "She usually has lunch at home."),
    cloze,
    wo("a2.o2", "We often walk to school together."),
    translationChoice,
    { ...translateWrite, id: "a2.w1", accepted: ["They go to the gym on Mondays."] },
    wo("a2.o3", "He never drinks coffee at night."),
  ] as Exercise[];

  it("turns at most two exercises of a session into listening, keeping the count and order", () => {
    const mixed = mixListening(session, { pool, rng: rngFrom(1) });
    expect(mixed).toHaveLength(session.length);
    const listening = mixed.filter(isListenExercise);
    expect(listening).toHaveLength(MAX_LISTENING_PER_SESSION);
    mixed.forEach((exercise, i) => {
      if (isListenExercise(exercise)) {
        expect(exercise.sourceId).toBe(session[i]!.id);
        // The same items, so each due item is still practiced exactly once.
        expect(exercise.itemIds).toEqual(session[i]!.itemIds);
      } else {
        expect(exercise).toBe(session[i]);
      }
    });
    // The first a dictation, the second a choice.
    expect(listening.map((e) => e.mode)).toEqual(["write", "choose"]);
  });

  it("never turns the first exercise, and short sessions get at most one", () => {
    const short = session.slice(0, 4);
    for (let seed = 0; seed < 20; seed++) {
      const mixed = mixListening(short, { pool, rng: rngFrom(seed) });
      expect(mixed.filter(isListenExercise).length).toBeLessThanOrEqual(1);
      expect(isListenExercise(mixed[0]!)).toBe(false);
    }
  });

  it("is deterministic for the same rng seed", () => {
    expect(mixListening(session, { pool, rng: rngFrom(7) })).toEqual(
      mixListening(session, { pool, rng: rngFrom(7) }),
    );
  });

  it("leaves a session without sentences to hear unchanged", () => {
    const plain = [vocab, cloze, translationChoice] as Exercise[];
    expect(mixListening(plain, { pool, rng: rngFrom(1) })).toEqual(plain);
  });

  it("works with the real corpus's review exercises", () => {
    const mixed = mixListening(corpus.exercises.slice(0, 20), { pool, rng: rngFrom(3) });
    expect(mixed.filter(isListenExercise).length).toBeGreaterThan(0);
  });
});

describe("listening choices", () => {
  const choose = (seed: number): ListenExercise => {
    const mixed = mixListening(
      [
        vocab,
        wo("a2.o1", "She usually has lunch at home."),
        cloze,
        wo("a2.o2", "We often walk to school together."),
        translationChoice,
        wo("a2.o3", "He never drinks coffee at night."),
      ] as Exercise[],
      { pool, rng: rngFrom(seed) },
    );
    const found = mixed.filter(isListenExercise).find((e) => e.mode === "choose");
    if (found === undefined) throw new Error("no choice exercise");
    return found;
  };

  it("offers the sentence heard and two other sentences of the pool", () => {
    const exercise = choose(1);
    expect(exercise.options).toHaveLength(3);
    expect(exercise.options[0]).toBe(exercise.sentence);
    expect(new Set(exercise.options.map((o) => o.toLowerCase())).size).toBe(3);
    const texts = new Set(pool.map((s) => s.text));
    for (const option of exercise.options.slice(1)) expect(texts.has(option)).toBe(true);
  });
});

describe("grading a listening exercise", () => {
  const dictation: ListenExercise = {
    type: "listen",
    mode: "write",
    id: "a2.o1~listen",
    sourceId: "a2.o1",
    itemIds: ["a2.routine.usually"],
    level: "A2",
    sentence: "I usually go to bed at eleven.",
    answers: ["I usually go to bed at eleven.", "I usually go to bed at 11."],
    options: [],
  };

  it("accepts the sentence heard whatever the case and punctuation", () => {
    expect(
      gradeExercise(dictation, { kind: "text", text: "i usually go to bed at eleven" }).verdict,
    ).toBe("correct");
    expect(
      gradeExercise(dictation, { kind: "text", text: "I usually go to bed at 11" }).verdict,
    ).toBe("correct");
  });

  it("marks a typo as almost and anything else as wrong, showing the sentence heard", () => {
    expect(
      gradeExercise(dictation, { kind: "text", text: "I usualy go to bed at eleven." }).verdict,
    ).toBe("almost");
    const wrong = gradeExercise(dictation, { kind: "text", text: "I go out" });
    expect(wrong).toMatchObject({
      verdict: "wrong",
      correctAnswer: "I usually go to bed at eleven.",
    });
  });

  it("grades a choice by the sentence picked", () => {
    const chooseOne: ListenExercise = {
      ...dictation,
      mode: "choose",
      options: ["I usually go to bed at eleven.", "She goes to work by bus.", "We eat at home."],
    };
    expect(
      gradeExercise(chooseOne, { kind: "choice", option: "I usually go to bed at eleven." }),
    ).toMatchObject({ verdict: "correct", correctAnswer: "I usually go to bed at eleven." });
    expect(gradeExercise(chooseOne, { kind: "choice", option: "We eat at home." }).verdict).toBe(
      "wrong",
    );
  });

  it("prepares a choice by shuffling its options, a dictation as is", () => {
    const chooseOne: ListenExercise = {
      ...dictation,
      mode: "choose",
      options: ["A b c.", "D e f.", "G h i."],
    };
    const prepared = prepareExercise(chooseOne, rngFrom(2));
    expect(prepared.type).toBe("listen");
    if (prepared.type !== "listen") return;
    expect([...prepared.options].sort()).toEqual([...chooseOne.options].sort());
    expect(prepareExercise(dictation, rngFrom(2))).toMatchObject({ type: "listen", options: [] });
  });

  it("records its items like any exercise in a session, and cannot be disputed", () => {
    let state = startLesson({ id: "review", title: "Repaso" }, [vocab, dictation]);
    state = lessonSessionReducer(state, {
      type: "answer",
      response: { kind: "choice", option: "despertarse" },
      responseMs: 1_000,
    });
    state = lessonSessionReducer(state, { type: "next" });
    state = lessonSessionReducer(state, {
      type: "answer",
      response: { kind: "text", text: "I go out" },
      responseMs: 5_000,
    });
    expect(canDispute(state)).toBe(false);
    expect(lessonSessionReducer(state, { type: "dispute" })).toBe(state);
    state = lessonSessionReducer(state, { type: "next" });
    if (state.status !== "finished") throw new Error("not finished");

    expect(state.summary.verdicts).toEqual(["correct", "wrong"]);
    expect(state.summary.itemOutcomes).toContainEqual({
      itemId: "a2.routine.usually",
      exerciseType: "listen",
      verdict: "wrong",
      responseMs: 5_000,
    });
    expect(finalGrades(state.summary).get("a2.routine.usually")).toBe(1);
  });

  it("a quick right dictation earns a top grade", () => {
    let state = startLesson({ id: "review", title: "Repaso" }, [dictation]);
    state = lessonSessionReducer(state, {
      type: "answer",
      response: { kind: "text", text: "I usually go to bed at eleven." },
      responseMs: 9_000,
    });
    state = lessonSessionReducer(state, { type: "next" });
    if (state.status !== "finished") throw new Error("not finished");
    expect(finalGrades(state.summary).get("a2.routine.usually")).toBe(5);
  });
});
