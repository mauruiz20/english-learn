import { describe, expect, it } from "vitest";
import * as fx from "../testing/fixtures";
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

describe("generated corpus", () => {
  it("is exported from the package entry with the seed content", async () => {
    const { corpus } = await import("../index");

    const lesson = corpus.lessonsById.get("a2.daily-routine.lesson-001");
    expect(lesson?.title).toBe("Mi rutina diaria");
    expect(lesson?.exerciseIds.every((id) => corpus.exercisesById.has(id))).toBe(true);
    expect(corpus.placement.length).toBeGreaterThan(0);
  });
});
