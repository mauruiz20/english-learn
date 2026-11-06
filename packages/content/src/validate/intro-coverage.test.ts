import { describe, expect, it } from "vitest";
import { corpus } from "../generated/corpus";
import type { Level } from "../schema";

/**
 * Levels whose path lessons must all have an `intro`, and that must have a `level.json`.
 * B1, B2 and C1 intros are written separately: once a level's intros are in, add it here (and
 * once every level is, this list is `LEVELS`). Practice lessons and dialogues never need one.
 */
const LEVELS_WITH_INTROS: readonly Level[] = ["A1", "A2"];

describe("intro coverage", () => {
  it.each(LEVELS_WITH_INTROS)("every %s path lesson has an intro", (level) => {
    const lessons = corpus.lessons.filter((lesson) => lesson.level === level);
    expect(lessons.length).toBeGreaterThan(0);
    expect(lessons.filter((lesson) => lesson.intro === undefined).map((l) => l.id)).toEqual([]);
  });

  it.each(LEVELS_WITH_INTROS)("%s has a level intro", (level) => {
    expect(corpus.levelIntrosByLevel.get(level)?.level).toBe(level);
  });
});
