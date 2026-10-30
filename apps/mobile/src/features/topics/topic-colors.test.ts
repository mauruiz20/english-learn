import { corpus } from "@english-learn/content/corpus";
import { LEVELS } from "@english-learn/domain";
import { lessonsForLevel } from "@/features/lesson/model/lesson-catalog";
import {
  TOPIC_HIGHLIGHTERS,
  levelHighlighter,
  stickyNoteHighlighter,
  topicByExerciseId,
  topicByItemId,
  topicHighlighter,
} from "./topic-colors";

const topicsInIndexOrder = (level: (typeof LEVELS)[number]) => {
  const topics: string[] = [];
  for (const lesson of lessonsForLevel(corpus.lessons, level).lessons) {
    if (topics[topics.length - 1] !== lesson.topic) topics.push(lesson.topic);
  }
  return topics;
};

describe("topicHighlighter", () => {
  it("gives every corpus topic an explicit color", () => {
    const missing = [...new Set(corpus.lessons.map((l) => l.topic))].filter(
      (topic) => !(topic in TOPIC_HIGHLIGHTERS),
    );
    expect(missing).toEqual([]);
  });

  it("never colors a topic yellow: yellow means correct", () => {
    expect(Object.values(TOPIC_HIGHLIGHTERS)).not.toContain("yellow");
    expect(topicHighlighter("a-topic-nobody-wrote-yet")).not.toBe("yellow");
  });

  it.each(LEVELS.map((level) => [level]))(
    "does not repeat a color between neighboring topics of the %s index",
    (level) => {
      const colors = topicsInIndexOrder(level).map(topicHighlighter);
      colors.slice(1).forEach((color, i) => expect(color).not.toBe(colors[i]));
    },
  );

  it("is deterministic for unknown topics", () => {
    expect(topicHighlighter("space")).toBe(topicHighlighter("space"));
  });
});

describe("topic lookups", () => {
  it("finds the topic of the lesson an exercise or item belongs to", () => {
    const lesson = corpus.lessons[0]!;
    const exerciseId = lesson.exerciseIds[0]!;
    const itemId = corpus.exercisesById.get(exerciseId)!.itemIds[0]!;

    expect(topicByExerciseId(corpus).get(exerciseId)).toBe(lesson.topic);
    expect(topicByItemId(corpus).get(itemId)).toBe(lesson.topic);
  });
});

describe("levelHighlighter", () => {
  it("gives each CEFR level its own highlighter", () => {
    const colors = LEVELS.map(levelHighlighter);
    expect(new Set(colors).size).toBe(LEVELS.length);
  });
});

describe("stickyNoteHighlighter", () => {
  it("rotates daily among pink, green, orange and sky", () => {
    const days = ["2030-01-01", "2030-01-02", "2030-01-03", "2030-01-04", "2030-01-05"];
    const colors = days.map(stickyNoteHighlighter);
    expect(new Set(colors.slice(0, 4))).toEqual(new Set(["pink", "green", "orange", "sky"]));
    expect(colors[4]).toBe(colors[0]);
    expect(stickyNoteHighlighter("2030-01-02")).toBe(colors[1]);
  });
});
