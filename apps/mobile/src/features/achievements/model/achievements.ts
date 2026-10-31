import type { Corpus } from "@english-learn/content";
import type { Level, PlacementResult, ReviewState, Streak } from "@english-learn/domain";
import { isLessonDone } from "@/features/lesson/model/lesson-catalog";
import type { HighlighterName } from "@/shared/ui/theme";

/** What the album's stickers are earned from: all derived from the stored progress. */
export type AchievementFacts = {
  readonly xp: number;
  /** The longest streak ever (a streak sticker stays won when the streak breaks). */
  readonly longestStreak: number;
  /** Lessons done, every level. */
  readonly lessonsDone: number;
  /** Topics (of a level) with every lesson done. */
  readonly topicsDone: number;
  /** Levels with every lesson done. */
  readonly levelsDone: readonly Level[];
  readonly placed: boolean;
  /** Words and phrases practiced at least once. */
  readonly wordsPracticed: number;
};

export type Achievement = {
  readonly id: string;
  /** The sticker's name in the album. */
  readonly title: string;
  /** How to earn it, said to the learner. */
  readonly howTo: string;
  readonly color: HighlighterName;
  /** A rare sticker shines (holographic) in the album. */
  readonly rare?: boolean;
  readonly earned: (facts: AchievementFacts) => boolean;
};

/** The album, in order. Original names; every one can be earned with the bundled content. */
export const ACHIEVEMENTS: readonly Achievement[] = [
  {
    id: "first-lesson",
    title: "Primer sticker",
    howTo: "Completa tu primera lección.",
    color: "green",
    earned: (f) => f.lessonsDone >= 1,
  },
  {
    id: "lessons-5",
    title: "Cinco stickers",
    howTo: "Completa 5 lecciones.",
    color: "sky",
    earned: (f) => f.lessonsDone >= 5,
  },
  {
    id: "lessons-20",
    title: "Hoja completa",
    howTo: "Completa 20 lecciones.",
    color: "lilac",
    earned: (f) => f.lessonsDone >= 20,
  },
  {
    id: "first-topic",
    title: "Tema terminado",
    howTo: "Completa todas las lecciones de un tema.",
    color: "orange",
    earned: (f) => f.topicsDone >= 1,
  },
  {
    id: "topics-5",
    title: "Cinco temas",
    howTo: "Completa 5 temas.",
    color: "pink",
    earned: (f) => f.topicsDone >= 5,
  },
  {
    id: "level-a2",
    title: "Nivel A2 completo",
    howTo: "Completa todas las lecciones de A2.",
    color: "yellow",
    rare: true,
    earned: (f) => f.levelsDone.includes("A2"),
  },
  {
    id: "level-b1",
    title: "Nivel B1 completo",
    howTo: "Completa todas las lecciones de B1.",
    color: "yellow",
    rare: true,
    earned: (f) => f.levelsDone.includes("B1"),
  },
  {
    id: "streak-3",
    title: "Tres clips",
    howTo: "Estudia 3 días seguidos.",
    color: "sky",
    earned: (f) => f.longestStreak >= 3,
  },
  {
    id: "streak-7",
    title: "Una semana",
    howTo: "Estudia 7 días seguidos.",
    color: "green",
    earned: (f) => f.longestStreak >= 7,
  },
  {
    id: "streak-30",
    title: "Un mes entero",
    howTo: "Estudia 30 días seguidos.",
    color: "lilac",
    rare: true,
    earned: (f) => f.longestStreak >= 30,
  },
  {
    id: "xp-100",
    title: "100 XP",
    howTo: "Gana 100 XP.",
    color: "orange",
    earned: (f) => f.xp >= 100,
  },
  {
    id: "xp-500",
    title: "500 XP",
    howTo: "Gana 500 XP.",
    color: "pink",
    earned: (f) => f.xp >= 500,
  },
  {
    id: "xp-2000",
    title: "2000 XP",
    howTo: "Gana 2000 XP.",
    color: "yellow",
    rare: true,
    earned: (f) => f.xp >= 2000,
  },
  {
    id: "placement",
    title: "Nivel encontrado",
    howTo: "Haz el test de nivel.",
    color: "sky",
    earned: (f) => f.placed,
  },
  {
    id: "words-50",
    title: "50 palabras",
    howTo: "Practica 50 palabras o frases.",
    color: "green",
    earned: (f) => f.wordsPracticed >= 50,
  },
  {
    id: "words-200",
    title: "200 palabras",
    howTo: "Practica 200 palabras o frases.",
    color: "orange",
    earned: (f) => f.wordsPracticed >= 200,
  },
];

const ORDER = new Map(ACHIEVEMENTS.map((a, i) => [a.id, i]));

/** Ids of the stickers the facts earn, in album order. */
export function unlockedAchievements(facts: AchievementFacts): string[] {
  return ACHIEVEMENTS.filter((a) => a.earned(facts)).map((a) => a.id);
}

/** Ids unlocked in `after` that were not in `before`, in album order. */
export function newlyUnlocked(before: readonly string[], after: readonly string[]): string[] {
  const had = new Set(before);
  return after
    .filter((id) => !had.has(id))
    .sort((a, b) => (ORDER.get(a) ?? 0) - (ORDER.get(b) ?? 0));
}

export type StoredProgress = {
  readonly states: readonly ReviewState[];
  readonly xp: number;
  readonly streak: Streak;
  readonly placement: PlacementResult | null;
};

/** The facts behind the album, from the stored progress and the bundled content. */
export function achievementFacts(content: Corpus, progress: StoredProgress): AchievementFacts {
  const reviewed = new Set(progress.states.map((s) => s.itemId));
  const done = (id: string) => {
    const lesson = content.lessonsById.get(id);
    return lesson !== undefined && isLessonDone(lesson, content.exercisesById, reviewed);
  };
  const doneIds = new Set(content.lessons.filter((l) => done(l.id)).map((l) => l.id));
  const groupDone = (key: (l: Corpus["lessons"][number]) => string) => {
    const groups = new Map<string, boolean>();
    for (const lesson of content.lessons) {
      const k = key(lesson);
      groups.set(k, (groups.get(k) ?? true) && doneIds.has(lesson.id));
    }
    return [...groups].filter(([, all]) => all).map(([k]) => k);
  };
  return {
    xp: progress.xp,
    longestStreak: progress.streak.longest,
    lessonsDone: doneIds.size,
    topicsDone: groupDone((l) => `${l.level}/${l.topic}`).length,
    levelsDone: groupDone((l) => l.level) as Level[],
    placed: progress.placement !== null,
    wordsPracticed: reviewed.size,
  };
}
