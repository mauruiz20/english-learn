import { createCorpus } from "@english-learn/content";
import { allExercises, lesson, passage } from "./fixtures";
import {
  DEFAULT_LEVEL,
  isLessonDone,
  lessonExercises,
  lessonItemIds,
  lessonsForLevel,
} from "./lesson-catalog";

const content = createCorpus([
  {
    exercises: allExercises,
    passages: [passage],
    lessons: [lesson, { ...lesson, id: "b1.routine.lesson-001", level: "B1", title: "B1" }],
  },
]);

describe("lesson catalog", () => {
  it("resolves a lesson's exercises in order", () => {
    expect(lessonExercises(lesson, content.exercisesById)).toEqual(allExercises);
  });

  it("lists a lesson's distinct item ids in order of first appearance", () => {
    expect(lessonItemIds(lesson, content.exercisesById)).toEqual([
      "a2.routine.wake-up",
      "a2.routine.breakfast",
      "a2.routine.usually",
      "a2.routine.go-to-bed",
      "a2.routine.commute",
    ]);
  });

  it("picks the lessons of the learner's level", () => {
    expect(lessonsForLevel(content.lessons, "B1")).toEqual({
      level: "B1",
      lessons: [content.lessonsById.get("b1.routine.lesson-001")],
    });
  });

  it.each([null, "C1"] as const)("falls back to A2 when the level is %s", (level) => {
    expect(DEFAULT_LEVEL).toBe("A2");
    expect(lessonsForLevel(content.lessons, level)).toEqual({ level: "A2", lessons: [lesson] });
  });

  it("counts a lesson as done once every item has a review state", () => {
    const ids = lessonItemIds(lesson, content.exercisesById);

    expect(isLessonDone(lesson, content.exercisesById, new Set(ids))).toBe(true);
    expect(isLessonDone(lesson, content.exercisesById, new Set(ids.slice(1)))).toBe(false);
    expect(
      isLessonDone({ ...lesson, exerciseIds: ["missing"] }, content.exercisesById, new Set()),
    ).toBe(false);
  });
});
