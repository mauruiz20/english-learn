import { createCorpus } from "@english-learn/content";
import { corpus } from "@english-learn/content/corpus";
import { allExercises, lesson, passage } from "./fixtures";
import {
  DEFAULT_LEVEL,
  isLessonDone,
  lessonExercises,
  lessonLevelFor,
  lessonItemIds,
  lessonsForLevel,
  pathLessons,
  pathLevels,
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

    // Production bug: before B2 had lessons, a B2 or C1 placement started the path on B1. Once
    // B2 lessons shipped, the same placement mapped to B2 and home jumped past a B1 the learner
    // was a quarter of the way through.
    it.each(["B2", "C1"] as const)(
      "keeps a learner placed at %s on a B1 they started and did not finish",
      (placement) => {
        const b1Lessons = corpus.lessons.filter((l) => l.level === "B1");
        const started = b1Lessons.slice(0, Math.round(b1Lessons.length * 0.23)).map((l) => l.id);
        expect(started.length).toBeGreaterThan(0);

        expect(lessonLevelFor(corpus.lessons, placement)).toBe("B2");
        expect(pathLessons(corpus.lessons, placement, doneIds(...started)).level).toBe("B1");
      },
    );
  });

  describe("the automatic path level", () => {
    const two = (level: "A2" | "B1" | "B2") =>
      [1, 2].map((n) => ({ ...lesson, id: `${level.toLowerCase()}.x.lesson-00${n}`, level }));
    const [a2a, a2b] = two("A2");
    const [b1a, b1b] = two("B1");
    const [b2a] = two("B2");
    const lessons = [...two("A2"), ...two("B1"), ...two("B2")];
    const done =
      (...ids: string[]) =>
      (l: { id: string }) =>
        ids.includes(l.id);
    const levelOf = (placement: Parameters<typeof pathLessons>[1], ...ids: string[]) =>
      pathLessons(lessons, placement, done(...ids)).level;

    it("starts a new learner on the placement's lesson level", () => {
      expect(levelOf("B2")).toBe("B2");
      expect(levelOf("C1")).toBe("B2");
      expect(levelOf(null)).toBe("A2");
    });

    it("stays on the level below the placement while it is started and not finished", () => {
      expect(levelOf("B2", b1a!.id)).toBe("B1");
      expect(levelOf("C1", b1a!.id, b2a!.id)).toBe("B1");
      expect(levelOf("B1", a2a!.id)).toBe("A2");
    });

    it("prefers the started level nearest to the placement", () => {
      expect(levelOf("B2", a2a!.id, b1a!.id)).toBe("B1");
    });

    it("moves on once the started level below the placement is finished", () => {
      expect(levelOf("B2", b1a!.id, b1b!.id)).toBe("B2");
      expect(levelOf("B1", a2a!.id, a2b!.id)).toBe("B1");
      expect(levelOf("B1", a2a!.id, a2b!.id, b1a!.id, b1b!.id)).toBe("B2");
    });

    it("ignores a started level that is not right below the placement", () => {
      // B1 untouched: the newer placement wins over an old A2 lesson.
      expect(levelOf("B2", a2a!.id)).toBe("B2");
      // B1 finished: a leftover A2 lesson does not pull the path back down.
      expect(levelOf("B2", a2a!.id, b1a!.id, b1b!.id)).toBe("B2");
    });
  });

  describe("a level chosen by hand", () => {
    const b1 = content.lessonsById.get("b1.routine.lesson-001")!;
    const b2 = { ...lesson, id: "b2.x.lesson-001", level: "B2", title: "B2" } as const;
    const all = [...content.lessons, b2];
    const none = () => false;

    it("overrides the automatic level, below or above it", () => {
      expect(pathLessons(all, "B1", none, "A2")).toEqual({ level: "A2", lessons: [lesson] });
      expect(pathLessons(all, "B1", none, "B2")).toEqual({ level: "B2", lessons: [b2] });
    });

    it("stays on the chosen level once it is finished", () => {
      expect(pathLessons(all, "B1", (l) => l.id === b1.id, "B1").level).toBe("B1");
    });

    it("falls back to the automatic level when the chosen one has no lessons", () => {
      expect(pathLessons(all, "B1", none, "C1").level).toBe("B1");
      expect(pathLessons(all, "B1", none, null).level).toBe("B1");
    });
  });

  it("lists each level with lessons and how many of them are done", () => {
    const b2 = { ...lesson, id: "b2.x.lesson-001", level: "B2" } as const;

    expect(pathLevels([...content.lessons, b2], (l) => l.id === lesson.id)).toEqual([
      { level: "A2", done: 1, total: 1 },
      { level: "B1", done: 0, total: 1 },
      { level: "B2", done: 0, total: 1 },
    ]);
    expect(pathLevels([], () => true)).toEqual([]);
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
