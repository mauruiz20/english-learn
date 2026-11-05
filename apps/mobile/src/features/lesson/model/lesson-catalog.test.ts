import { createCorpus } from "@english-learn/content";
import { allExercises, lesson, passage } from "./fixtures";
import {
  DEFAULT_LEVEL,
  isLessonDone,
  lessonExercises,
  lessonLevelFor,
  lessonItemIds,
  lessonsForLevel,
  pathLessons,
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

  it("maps B2 and C1 to B2 once B2 has lessons", () => {
    const b2 = { ...lesson, id: "b2.x.lesson-001", level: "B2" } as const;

    expect(lessonLevelFor([...content.lessons, b2], "B2")).toBe("B2");
    expect(lessonLevelFor([...content.lessons, b2], "C1")).toBe("B2");
    expect(lessonLevelFor([...content.lessons, b2], "B1")).toBe("B1");
  });

  describe("pathLessons", () => {
    const b1 = content.lessonsById.get("b1.routine.lesson-001")!;
    const b2 = { ...lesson, id: "b2.x.lesson-001", level: "B2", title: "B2" } as const;
    const all = [...content.lessons, b2];
    const doneIds =
      (...ids: string[]) =>
      (l: { id: string }) =>
        ids.includes(l.id);

    it("stays on the placement's lesson level while it has lessons to do", () => {
      expect(pathLessons(all, "B1", doneIds())).toEqual({ level: "B1", lessons: [b1] });
      expect(pathLessons(all, null, doneIds())).toEqual({ level: "A2", lessons: [lesson] });
    });

    it("moves on to the next level with lessons once every lesson of the level is done", () => {
      expect(pathLessons(all, null, doneIds(lesson.id)).level).toBe("B1");
      expect(pathLessons(all, "B1", doneIds(b1.id))).toEqual({ level: "B2", lessons: [b2] });
      expect(pathLessons(all, "A1", doneIds(lesson.id, b1.id)).level).toBe("B2");
    });

    it("keeps the last level with lessons when everything is done", () => {
      expect(pathLessons(all, "B2", doneIds(b2.id)).level).toBe("B2");
      expect(pathLessons(content.lessons, "B1", doneIds(b1.id)).level).toBe("B1");
    });

    it("never goes back below the placement's lesson level", () => {
      expect(pathLessons(all, "B2", doneIds()).level).toBe("B2");
    });

    it("uses the default level when there are no lessons at all", () => {
      expect(pathLessons([], "B1", doneIds())).toEqual({ level: "A2", lessons: [] });
    });
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
