/** A small "Práctica libre" corpus for tests (never shipped: only imported by tests). */
import {
  createCorpus,
  type Item,
  type Lesson,
  type PracticeCollection,
} from "@english-learn/content";
import { allExercises, lesson as pathLesson } from "@/features/lesson/model/fixtures";

const item = (id: string, term: string, es: string): Item => ({
  id,
  level: "A2",
  topics: ["routine"],
  kind: "word",
  term,
  es,
});

/** Two practice lessons over the lesson fixtures' exercises, in one A2 group. */
export const practiceLessons: readonly Lesson[] = [1, 2].map((n) => ({
  id: `a2.phrasal-verbs.practice-home-${n}`,
  level: "A2",
  topic: "phrasal-verbs",
  title: n === 1 ? "Casa y rutina: conócelos" : "Casa y rutina: practícalos",
  exerciseIds: allExercises.slice(0, n === 1 ? 6 : 4).map((e) => e.id),
}));

export const collection: PracticeCollection = {
  id: "practice.phrasal-verbs",
  title: "Phrasal verbs",
  summary: "Verbos con partícula por tema.",
  groups: [
    {
      id: "practice.phrasal-verbs.home",
      level: "A2",
      title: "Casa y rutina",
      summary: "Ordenar y descansar en casa.",
      lessonIds: practiceLessons.map((l) => l.id),
    },
  ],
};

/** The lesson fixtures (one path lesson) plus the practice collection above. */
export const practiceContent = createCorpus([
  {
    items: [
      item("a2.routine.wake-up", "wake up", "despertarse"),
      item("a2.routine.breakfast", "breakfast", "desayuno"),
      item("a2.routine.usually", "usually", "normalmente"),
    ],
    exercises: allExercises,
    lessons: [pathLesson, ...practiceLessons],
    practice: [collection],
  },
]);
