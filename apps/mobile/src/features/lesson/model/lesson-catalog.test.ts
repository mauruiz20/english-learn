import { createCorpus } from "@english-learn/content";
import { allExercises, lesson, passage } from "./fixtures";
import {
  DEFAULT_LEVEL,
  isLessonDone,
  lessonExercises,
  lessonLevelFor,
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

  it("falls back to A2 when there is no level yet", () => {
    expect(DEFAULT_LEVEL).toBe("A2");
    expect(lessonsForLevel(content.lessons, null)).toEqual({ level: "A2", lessons: [lesson] });
  });

  it.each([
    ["A1", "A2"],
    ["A2", "A2"],
    ["B1", "B1"],
    ["B2", "B1"],
    ["C1", "B1"],
  ] as const)("maps level %s to the nearest level with lessons (%s)", (level, expected) => {
    expect(lessonLevelFor(content.lessons, level)).toBe(expected);
    expect(lessonsForLevel(content.lessons, level).level).toBe(expected);
  });

  it("prefers the lower level on a tie", () => {
    const c1 = { ...lesson, id: "c1.x.lesson-001", level: "C1" } as const;

    expect(lessonLevelFor([...content.lessons, c1], "B2")).toBe("B1");
  });

  it("uses the default level when there are no lessons at all", () => {
    expect(lessonsForLevel([], "C1")).toEqual({ level: "A2", lessons: [] });
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
