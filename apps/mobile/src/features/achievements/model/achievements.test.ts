import { corpus } from "@english-learn/content/corpus";
import { EMPTY_STREAK, initialState, localDate, type ReviewState } from "@english-learn/domain";
import { lessonItemIds } from "@/features/lesson/model/lesson-catalog";
import {
  ACHIEVEMENTS,
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
      levelsDone: ["A2", "B1", "B2"],
      placed: true,
      wordsPracticed: 999,
      cardsStudied: 28,
      grammarLevelsDone: ["A2"],
    });
    expect(all).toEqual(ACHIEVEMENTS.map((a) => a.id));
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
