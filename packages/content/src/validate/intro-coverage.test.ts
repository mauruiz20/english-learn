import { describe, expect, it } from "vitest";
import { corpus } from "../generated/corpus";
import { LEVELS } from "../schema";

/**
 * Every level's path lessons must all have an `intro`, and every level a `level.json`. A new
 * level joins `LEVELS` with its intros written. Practice lessons and dialogues never need one.
 */
describe("intro coverage", () => {
  it.each(LEVELS)("every %s path lesson has an intro", (level) => {
    const lessons = corpus.lessons.filter((lesson) => lesson.level === level);
    expect(lessons.length).toBeGreaterThan(0);
    expect(lessons.filter((lesson) => lesson.intro === undefined).map((l) => l.id)).toEqual([]);
  });

  it.each(LEVELS)("%s has a level intro", (level) => {
    expect(corpus.levelIntrosByLevel.get(level)?.level).toBe(level);
  });
});
