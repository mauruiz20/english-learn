import { describe, expect, it } from "vitest";
import * as fx from "../testing/fixtures";
import { annotateText } from "@english-learn/domain";
import { createCorpus } from "./corpus";

describe("createCorpus", () => {
  it("concatenates entities from every file in order", () => {
    const first = fx.validFile();
    const second = {
      items: [fx.item({ id: "b1.travel.book", term: "book", es: "reservar" })],
    };

    const corpus = createCorpus([first, second, {}]);

    expect(corpus.items.map((i) => i.id)).toEqual([
      ...(first.items ?? []).map((i) => i.id),
      "b1.travel.book",
    ]);
    expect(corpus.exercises).toEqual(first.exercises ?? []);
    expect(corpus.passages).toEqual(first.passages ?? []);
    expect(corpus.lessons).toEqual(first.lessons ?? []);
    expect(corpus.placement).toEqual(first.placement ?? []);
  });

  it("indexes items, exercises, passages and lessons by id", () => {
    const file = fx.validFile();
    const corpus = createCorpus([file]);

    const exercise = file.exercises?.[0];
    const lesson = file.lessons?.[0];
    const passage = file.passages?.[0];
    expect(exercise && corpus.exercisesById.get(exercise.id)).toBe(exercise);
    expect(lesson && corpus.lessonsById.get(lesson.id)).toBe(lesson);
    expect(passage && corpus.passagesById.get(passage.id)).toBe(passage);
    expect(corpus.itemsById.get("b1.travel.although")?.term).toBe("although");
    expect(corpus.itemsById.get("missing")).toBeUndefined();
  });

  it("collects the level intros, by level", () => {
    const a2 = fx.levelIntro({ level: "A2", title: "Nivel A2" });
    const corpus = createCorpus([
      fx.validFile(),
      { levelIntro: fx.levelIntro() },
      { levelIntro: a2 },
    ]);

    expect(corpus.levelIntros).toEqual([fx.levelIntro(), a2]);
    expect(corpus.levelIntrosByLevel.get("A2")).toBe(a2);
    expect(corpus.levelIntrosByLevel.get("C1")).toBeUndefined();
  });

  it("returns an empty corpus for no files", () => {
    const corpus = createCorpus([]);

    expect(corpus.items).toEqual([]);
    expect(corpus.lessonsById.size).toBe(0);
  });
});

describe("createCorpus glossary", () => {
  it("merges glossary entries, indexes them by id and builds the lookup index", () => {
    const files = fx.glossaryFiles().map((f) => f.data);
    const corpus = createCorpus([fx.validFile(), ...files]);

    expect(corpus.glossary.map((e) => e.id)).toEqual(
      files.flatMap((f) => (f.glossary ?? []).map((e) => e.id)),
    );
    expect(corpus.glossaryById.get("glossary.go-out")?.forms).toEqual(["go out", "went out"]);
    const linked = annotateText("We went out.", corpus.glossaryIndex)
      .filter((s) => s.entryId !== null)
      .map((s) => s.entryId);
    expect(linked).toEqual(["glossary.we", "glossary.go-out"]);
  });

  it("merges cards and indexes them by id", () => {
    const { data } = fx.cardFile();
    const vocabulary = fx.vocabularyCard();
    const corpus = createCorpus([data, { cards: [vocabulary] }]);

    expect(corpus.cards.map((c) => c.id)).toEqual(["b1.grammar.although", "b1.vocabulary.late"]);
    expect(corpus.cardsById.get("b1.vocabulary.late")).toBe(vocabulary);
    expect(createCorpus([]).cards).toEqual([]);
  });

  it("has an empty glossary and index for no files", () => {
    const corpus = createCorpus([]);
    expect(corpus.glossary).toEqual([]);
    expect(corpus.glossaryIndex.words.size).toBe(0);
  });
});

describe("generated corpus", () => {
  it("is exported from the package entry with the seed content", async () => {
    const { corpus } = await import("../index");

    const lesson = corpus.lessonsById.get("a2.daily-routine.lesson-001");
    expect(lesson?.title).toBe("Mi rutina diaria");
    expect(lesson?.exerciseIds.every((id) => corpus.exercisesById.has(id))).toBe(true);
    expect(corpus.placement.length).toBeGreaterThan(0);
    expect(corpus.glossary.length).toBeGreaterThan(0);
  });

  it("annotates every learner-visible text: exact rebuild, contiguous offsets, every word linked", async () => {
    const { corpus } = await import("../index");
    const { glossaryTexts } = await import("../validate");
    const { items, exercises, passages, placement, cards } = corpus;
    const texts = glossaryTexts([
      {
        file: "corpus",
        data: {
          items: [...items],
          exercises: [...exercises],
          passages: [...passages],
          placement: [...placement],
          cards: [...cards],
        },
      },
    ]);
    expect(texts.length).toBeGreaterThan(1000);

    for (const { path, text } of texts) {
      const segments = annotateText(text, corpus.glossaryIndex);
      expect(segments.map((s) => s.text).join(""), path).toBe(text);
      let cursor = 0;
      for (const s of segments) {
        expect([s.start, text.slice(s.start, s.end)], path).toEqual([cursor, s.text]);
        if (s.kind !== "other") expect(corpus.glossaryById.has(s.entryId ?? ""), path).toBe(true);
        cursor = s.end;
      }
      expect(cursor, path).toBe(text.length);
    }
  });
});

describe("createCorpus practice", () => {
  const practice = fx.practiceFiles().map((f) => f.data);

  it("lists the collections and keeps their lessons out of the path's lessons", () => {
    const corpus = createCorpus([fx.validFile(), ...practice]);

    expect(corpus.practice.map((c) => c.id)).toEqual(["practice.phrasal-verbs"]);
    expect(corpus.lessons.map((l) => l.id)).toEqual(["b1.travel.lesson-001"]);
    expect(corpus.lessonsById.has("b1.phrasal-verbs.practice-travel-1")).toBe(false);
    expect(corpus.practiceLessons.map((l) => l.id)).toEqual([
      "b1.phrasal-verbs.practice-travel-1",
      "b1.phrasal-verbs.practice-travel-2",
    ]);
    expect(corpus.practiceLessonsById.get("b1.phrasal-verbs.practice-travel-2")?.title).toBe(
      "Viajes 2",
    );
  });

  it("indexes practice items and exercises like any other", () => {
    const corpus = createCorpus([fx.validFile(), ...practice]);

    expect(corpus.itemsById.get("b1.phrasal-verbs.go-out")?.term).toBe("go out");
    expect(corpus.exercisesById.has("b1.phrasal-verbs.practice-travel-cloze-2")).toBe(true);
  });

  it("has no practice without collections", () => {
    const corpus = createCorpus([fx.validFile()]);

    expect(corpus.practice).toEqual([]);
    expect(corpus.practiceLessons).toEqual([]);
    expect(corpus.dialogues).toEqual([]);
  });
});

describe("createCorpus dialogues", () => {
  it("lists the dialogues by id, and their collection with the others", () => {
    const files = [...fx.practiceFiles(), ...fx.dialogueFiles()].map((f) => f.data);
    const corpus = createCorpus([fx.validFile(), ...files]);

    expect(corpus.dialogues.map((d) => d.id)).toEqual([fx.DIALOGUE_ID]);
    expect(corpus.dialoguesById.get(fx.DIALOGUE_ID)?.title).toBe("Un viaje corto");
    expect(corpus.practice.map((c) => c.id)).toEqual([
      "practice.phrasal-verbs",
      "practice.dialogues",
    ]);
    // A dialogue group lists no lessons.
    expect(corpus.practiceLessons.map((l) => l.id)).toEqual([
      "b1.phrasal-verbs.practice-travel-1",
      "b1.phrasal-verbs.practice-travel-2",
    ]);
  });
});
