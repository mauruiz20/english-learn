import type { Exercise, PlacementQuestion } from "@english-learn/content";
import type { PlacementCandidate } from "@english-learn/domain";

/** Options the learner sees: cloze shows `answers[0]` plus the distractors (see prepareExercise). */
function optionCount(question: PlacementQuestion): number {
  const { exercise } = question;
  return exercise.type === "cloze" ? 1 + exercise.distractors.length : exercise.options.length;
}

/** The domain CAT input for a question (difficulty defaults from its CEFR level). */
export function toPlacementCandidate(question: PlacementQuestion): PlacementCandidate {
  return { id: question.id, level: question.level, optionCount: optionCount(question) };
}

/**
 * The question as a regular exercise, so the lesson components, `prepareExercise` and
 * `gradeExercise` are reused. It practices no SRS item (`itemIds` is empty).
 */
export function placementExercise(question: PlacementQuestion): Exercise {
  return { ...question.exercise, id: question.id, level: question.level, itemIds: [] };
}
