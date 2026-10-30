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
});
