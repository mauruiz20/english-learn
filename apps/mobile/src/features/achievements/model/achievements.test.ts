import { createCorpus } from "@english-learn/content";
import { corpus } from "@english-learn/content/corpus";
import { lesson } from "@/features/lesson/model/fixtures";
import { EMPTY_STREAK, initialState, localDate, type ReviewState } from "@english-learn/domain";
import { lessonItemIds } from "@/features/lesson/model/lesson-catalog";
import {
  ACHIEVEMENTS,
  albumAchievements,
  achievementFacts,
  newlyUnlocked,
  unlockedAchievements,
  type AchievementFacts,
} from "./achievements";

const TODAY = localDate("2030-01-01");
const none: AchievementFacts = {
  xp: 0,
  longestStreak: 0,
  lessonsDone: 0,
  topicsDone: 0,
  levelsDone: [],
  placed: false,
  wordsPracticed: 0,
  cardsStudied: 0,
  grammarLevelsDone: [],
};

/** One review state per item the lessons practice (as after doing them). */
const statesFor = (lessonIds: readonly string[]): ReviewState[] => {
  const items = new Set(
    lessonIds.flatMap((id) => {
      const lesson = corpus.lessonsById.get(id);
      if (lesson === undefined) throw new Error(id);
      return lessonItemIds(lesson, corpus.exercisesById);
    }),
  );
  return [...items].map((item) => initialState(item, TODAY));
};

describe("ACHIEVEMENTS", () => {
  it("has unique ids, a title and a way to earn each, in Spanish", () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(12);
    for (const a of ACHIEVEMENTS) {
      expect(a.title.length).toBeGreaterThan(0);
      expect(a.howTo.length).toBeGreaterThan(0);
    }
  });
});

describe("unlockedAchievements", () => {
  it("unlocks nothing for a new learner", () => {
    expect(unlockedAchievements(none)).toEqual([]);
  });

  it("unlocks by lessons, topics, levels, streak, XP, placement and words", () => {
    expect(unlockedAchievements({ ...none, lessonsDone: 1 })).toEqual(["first-lesson"]);
    expect(unlockedAchievements({ ...none, longestStreak: 7 })).toEqual(["streak-3", "streak-7"]);
    expect(unlockedAchievements({ ...none, xp: 500 })).toEqual(["xp-100", "xp-500"]);
    expect(unlockedAchievements({ ...none, placed: true })).toEqual(["placement"]);
    expect(unlockedAchievements({ ...none, topicsDone: 1 })).toEqual(["first-topic"]);
    expect(unlockedAchievements({ ...none, levelsDone: ["B1"] })).toEqual(["level-b1"]);
    expect(unlockedAchievements({ ...none, levelsDone: ["B2"] })).toEqual(["level-b2"]);
    expect(unlockedAchievements({ ...none, levelsDone: ["A1"] })).toEqual(["level-a1"]);
    expect(unlockedAchievements({ ...none, levelsDone: ["C1"] })).toEqual(["level-c1"]);
    expect(unlockedAchievements({ ...none, wordsPracticed: 50 })).toEqual(["words-50"]);
  });

  it("unlocks by study cards: the first one, and every grammar card of a level", () => {
    expect(unlockedAchievements({ ...none, cardsStudied: 1 })).toEqual(["first-card"]);
    expect(unlockedAchievements({ ...none, grammarLevelsDone: ["B2"] })).toEqual(["grammar-level"]);
  });

  it("lists them in album order", () => {
    const all = unlockedAchievements({
      xp: 5000,
      longestStreak: 100,
      lessonsDone: 99,
      topicsDone: 99,
      levelsDone: ["A1", "A2", "B1", "B2", "C1"],
      placed: true,
      wordsPracticed: 999,
      cardsStudied: 28,
      grammarLevelsDone: ["A2"],
    });
    expect(all).toEqual(ACHIEVEMENTS.map((a) => a.id));
  });
});

describe("ACHIEVEMENTS: level stickers", () => {
  it("has one per level, A1 to C1, in level order", () => {
    const levels = ACHIEVEMENTS.filter((a) => a.id.startsWith("level-"));
    expect(levels.map((a) => [a.id, a.title, a.howTo])).toEqual([
      ["level-a1", "Nivel A1 completo", "Completa todas las lecciones de A1."],
      ["level-a2", "Nivel A2 completo", "Completa todas las lecciones de A2."],
      ["level-b1", "Nivel B1 completo", "Completa todas las lecciones de B1."],
      ["level-b2", "Nivel B2 completo", "Completa todas las lecciones de B2."],
      ["level-c1", "Nivel C1 completo", "Completa todas las lecciones de C1."],
    ]);
    expect(levels.every((a) => a.rare === true && a.color === "yellow")).toBe(true);
  });
});

describe("albumAchievements", () => {
  const ofLevels = (...levels: ("A1" | "A2" | "B1" | "B2" | "C1")[]) =>
    createCorpus([
      {
        lessons: levels.map((level) => ({
          ...lesson,
          id: `${level.toLowerCase()}.x.lesson-001`,
          level,
        })),
      },
    ]);
  const levelIds = (content: ReturnType<typeof ofLevels>) =>
    albumAchievements(content)
      .map((a) => a.id)
      .filter((id) => id.startsWith("level-"));

  it("shows a level's sticker only when that level has lessons", () => {
    expect(levelIds(ofLevels("A2", "B1", "B2"))).toEqual(["level-a2", "level-b1", "level-b2"]);
    expect(levelIds(ofLevels("A1", "A2", "B1", "B2", "C1"))).toEqual([
      "level-a1",
      "level-a2",
      "level-b1",
      "level-b2",
      "level-c1",
    ]);
  });

  it("keeps every other sticker, in album order", () => {
    const shown = albumAchievements(ofLevels("A2"));
    expect(shown.map((a) => a.id)).toEqual(
      ACHIEVEMENTS.filter((a) => !a.id.startsWith("level-") || a.id === "level-a2").map(
        (a) => a.id,
      ),
    );
  });

  it("matches the levels of the bundled content", () => {
    const bundled = new Set(corpus.lessons.map((l) => l.level.toLowerCase()));
    expect(levelIds(corpus)).toEqual(
      ["a1", "a2", "b1", "b2", "c1"].filter((l) => bundled.has(l)).map((l) => `level-${l}`),
    );
  });
});

describe("achievementFacts", () => {
  const firstA2 = corpus.lessons.filter((l) => l.level === "A2");
  const topic = firstA2[0]?.topic ?? "";
  const topicLessons = firstA2.filter((l) => l.topic === topic).map((l) => l.id);

  it("counts lessons, whole topics and whole levels done from review states", () => {
    const facts = achievementFacts(corpus, {
      states: statesFor(topicLessons),
      xp: 120,
      streak: { ...EMPTY_STREAK, longest: 4 },
      placement: null,
    });

    expect(facts.lessonsDone).toBe(topicLessons.length);
    expect(facts.topicsDone).toBe(1);
    expect(facts.levelsDone).toEqual([]);
    expect(facts.xp).toBe(120);
    expect(facts.longestStreak).toBe(4);
    expect(facts.placed).toBe(false);
    expect(facts.wordsPracticed).toBe(statesFor(topicLessons).length);
  });

  it("knows a level is done when all its lessons are", () => {
    const facts = achievementFacts(corpus, {
      states: statesFor(firstA2.map((l) => l.id)),
      xp: 0,
      streak: EMPTY_STREAK,
      placement: { level: "A2", theta: 0 },
    });

    expect(facts.levelsDone).toEqual(["A2"]);
    expect(facts.placed).toBe(true);
  });
});

describe("achievementFacts: study cards", () => {
  const grammarB2 = corpus.cards.filter((c) => c.kind === "grammar" && c.level === "B2");

  it("counts the cards whose items all have a review state, and the levels with all grammar studied", () => {
    const facts = achievementFacts(corpus, {
      states: grammarB2.flatMap((c) => c.itemIds.map((id) => initialState(id, TODAY))),
      xp: 0,
      streak: EMPTY_STREAK,
      placement: null,
    });

    expect(facts.cardsStudied).toBe(grammarB2.length);
    expect(facts.grammarLevelsDone).toEqual(["B2"]);
  });

  it("needs every grammar card of the level", () => {
    const facts = achievementFacts(corpus, {
      states: grammarB2[0]!.itemIds.map((id) => initialState(id, TODAY)),
      xp: 0,
      streak: EMPTY_STREAK,
      placement: null,
    });

    expect(facts.cardsStudied).toBe(1);
    expect(facts.grammarLevelsDone).toEqual([]);
  });
});

describe("newlyUnlocked", () => {
  it("lists what is unlocked now and was not before, in album order", () => {
    expect(newlyUnlocked(["xp-100"], ["first-lesson", "xp-100", "streak-3"])).toEqual([
      "first-lesson",
      "streak-3",
    ]);
  });
});
