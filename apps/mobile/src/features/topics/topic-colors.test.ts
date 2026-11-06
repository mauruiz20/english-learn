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
  it("gives every corpus topic an explicit color, the study cards' topics too", () => {
    const topics = [...corpus.lessons, ...corpus.cards].map((entity) => entity.topic);
    const missing = [...new Set(topics)].filter((topic) => !(topic in TOPIC_HIGHLIGHTERS));
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

  // Topics whose lessons may not be bundled yet, in index (file) order: they get their color
  // ahead of time, so the content needs no app change.
  it.each([
    [
      "A1",
      [
        "greetings",
        "to-be-and-questions",
        "numbers-and-age",
        "my-family",
        "colors-and-clothes",
        "food-and-drinks",
        "days-and-time",
        "my-house",
      ],
    ],
    [
      "C1",
      [
        "arts-and-culture",
        "global-issues",
        "language-and-communication",
        "law-and-ethics",
        "politics-and-media",
        "psychology-and-behaviour",
        "science-and-society",
        "work-and-negotiation",
      ],
    ],
  ])("colors every %s topic by hand, never twice in a row", (_level, topics) => {
    expect(topics.filter((topic) => !(topic in TOPIC_HIGHLIGHTERS))).toEqual([]);
    const colors = topics.map(topicHighlighter);
    colors.slice(1).forEach((color, i) => expect(color).not.toBe(colors[i]));
  });

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

  it("finds the topic of the study card an exercise outside any lesson belongs to", () => {
    const card = corpus.cardsById.get("b1.grammar.look-forward-to")!;
    const exerciseId = card.exerciseIds[0]!;

    expect(topicByExerciseId(corpus).get(exerciseId)).toBe("grammar");
    expect(topicByItemId(corpus).get(card.itemIds[0]!)).toBe("grammar");
  });

  it("keeps the lesson's topic for an item a lesson and a card share", () => {
    // The daily-routine phrasal verbs are practiced in the "Mi rutina diaria" lesson too.
    const card = corpus.cardsById.get("a2.phrasal-verbs.daily-routine")!;
    const lessonTopics = card.itemIds.map((id) => topicByItemId(corpus).get(id));

    expect(lessonTopics).toContain("daily-routine");
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
