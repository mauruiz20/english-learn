import { describe, expect, it } from "vitest";
import { corpus } from "../generated/corpus";
import { INTRODUCTIONS_CHECKPOINT_QUESTIONS } from "./introductions";

describe("A1 introductions checkpoint content", () => {
  it("keeps three distinct context questions out of the ordinary corpus", () => {
    const questions = INTRODUCTIONS_CHECKPOINT_QUESTIONS;
    const exercises = questions.map(({ exercise }) => exercise);
    expect(questions).toHaveLength(3);
    expect(new Set(exercises.map(({ id }) => id)).size).toBe(3);
    expect(exercises.every(({ type }) => type === "translation_choice")).toBe(true);
    expect(exercises.map((exercise) => exercise.options[exercise.answerIndex])).toEqual([
      "Me llamo Leo.",
      "¿Cómo te llamas?",
      "Mucho gusto.",
    ]);
    const sourceItems = new Set(
      corpus.lessonsById.get("a1.greetings.lesson-002")?.newItemIds ?? [],
    );
    expect(
      exercises.every((exercise) => exercise.itemIds.every((itemId) => sourceItems.has(itemId))),
    ).toBe(true);
    expect(exercises.every(({ id }) => !corpus.exercisesById.has(id))).toBe(true);
    expect(questions.map(({ contextEs }) => contextEs)).toEqual([
      "Te presentas a una persona nueva en el trabajo.",
      "Conoces a una persona nueva en clase y quieres preguntarle su nombre.",
      "Conoces a Ana por primera vez y quieres expresar que te da gusto conocerla.",
    ]);
    expect(exercises.map(({ sentence }) => sentence)).toEqual([
      "My name is Leo.",
      "What's your name?",
      "Nice to meet you.",
    ]);
  });
});
