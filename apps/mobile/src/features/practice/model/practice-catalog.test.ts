import { corpus } from "@english-learn/content/corpus";
import { lessonItemIds } from "@/features/lesson/model/lesson-catalog";
import { practiceContent } from "./fixtures";
import {
  practiceCollectionBySlug,
  practiceCollectionRows,
  practiceGroupRows,
  practiceLessonPlace,
  practiceSlug,
  shortLessonTitle,
} from "./practice-catalog";

const HOME_1 = "a2.phrasal-verbs.practice-home-1";
const HOME_2 = "a2.phrasal-verbs.practice-home-2";

describe("practiceSlug", () => {
  it("is the collection id without its prefix (its directory and route)", () => {
    expect(practiceSlug("practice.phrasal-verbs")).toBe("phrasal-verbs");
  });
});

describe("shortLessonTitle", () => {
  it("drops the group title the lesson title starts with, capitalized", () => {
    expect(shortLessonTitle("Casa y rutina: conócelos", "Casa y rutina")).toBe("Conócelos");
  });

  it("keeps a title that does not start with the group's", () => {
    expect(shortLessonTitle("Repaso general", "Casa y rutina")).toBe("Repaso general");
  });
});

describe("practiceCollectionRows", () => {
  it("counts each collection's groups, lessons and the lessons with a result", () => {
    const rows = practiceCollectionRows(practiceContent, [
      { lessonId: HOME_2, bestAccuracy: 0.5, completions: 1 },
      { lessonId: "a2.routine.lesson-001", bestAccuracy: 1, completions: 1 },
    ]);

    expect(rows).toEqual([
      {
        slug: "phrasal-verbs",
        title: "Phrasal verbs",
        summary: "Verbos con partícula por tema.",
        groups: 1,
        lessons: 2,
        done: 1,
      },
    ]);
  });
});

describe("practiceGroupRows", () => {
  const collection = practiceCollectionBySlug(practiceContent, "phrasal-verbs")!;

  it("lists every group with its level, verbs and lessons, all open", () => {
    const [group] = practiceGroupRows(collection, practiceContent, []);

    expect(group).toMatchObject({
      id: "practice.phrasal-verbs.home",
      level: "A2",
      title: "Casa y rutina",
      summary: "Ordenar y descansar en casa.",
    });
    // The verbs are the items its first lesson practices, in order.
    expect(group!.verbs).toEqual(["wake up", "breakfast", "usually"]);
    expect(group!.lessons).toEqual([
      { id: HOME_1, number: 1, title: "Conócelos", fullTitle: "Casa y rutina: conócelos" },
      { id: HOME_2, number: 2, title: "Practícalos", fullTitle: "Casa y rutina: practícalos" },
    ]);
  });

  it("gives a practiced lesson its best result over its exercises", () => {
    const [group] = practiceGroupRows(collection, practiceContent, [
      { lessonId: HOME_1, bestAccuracy: 1, completions: 2 },
      { lessonId: HOME_2, bestAccuracy: 0.75, completions: 1 },
    ]);

    expect(group!.lessons.map((l) => l.score)).toEqual([
      { correct: 6, total: 6, perfect: true },
      { correct: 3, total: 4, perfect: false },
    ]);
  });

  it("finds no collection for an unknown slug", () => {
    expect(practiceCollectionBySlug(practiceContent, "tiempos-verbales")).toBeUndefined();
  });
});

describe("practiceLessonPlace", () => {
  it("finds a practice lesson's collection and group", () => {
    expect(practiceLessonPlace(practiceContent, HOME_2)).toEqual({
      slug: "phrasal-verbs",
      collectionTitle: "Phrasal verbs",
      groupTitle: "Casa y rutina",
    });
  });

  it("finds nothing for a path lesson", () => {
    expect(practiceLessonPlace(practiceContent, "a2.routine.lesson-001")).toBeUndefined();
  });
});

describe("the bundled practice", () => {
  const phrasalVerbs = practiceCollectionBySlug(corpus, "phrasal-verbs");

  it("has a phrasal-verbs collection of about ten groups, every level a label", () => {
    expect(phrasalVerbs?.title).toBe("Phrasal verbs");
    const groups = practiceGroupRows(phrasalVerbs!, corpus, []);
    expect(groups.length).toBeGreaterThanOrEqual(10);
    for (const group of groups) {
      expect(["A2", "B1", "B2"]).toContain(group.level);
      expect(group.lessons.length).toBeGreaterThanOrEqual(2);
      expect(group.lessons.length).toBeLessThanOrEqual(3);
      expect(group.verbs.length).toBeGreaterThanOrEqual(5);
    }
  });

  it("keeps practice lessons out of the path's lessons and their items apart", () => {
    const pathIds = new Set(corpus.lessons.map((l) => l.id));
    const pathItems = new Set(
      corpus.lessons.flatMap((l) => lessonItemIds(l, corpus.exercisesById)),
    );
    expect(corpus.practiceLessons.length).toBeGreaterThan(0);
    for (const lesson of corpus.practiceLessons) {
      expect(pathIds.has(lesson.id)).toBe(false);
      for (const id of lessonItemIds(lesson, corpus.exercisesById)) {
        expect(pathItems.has(id)).toBe(false);
      }
    }
  });
});
