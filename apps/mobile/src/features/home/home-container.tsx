import type { Corpus } from "@english-learn/content";
import { corpus } from "@english-learn/content/corpus";
import { isStreakAlive, type Level, type ReviewState } from "@english-learn/domain";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { isLessonDone, lessonsForLevel } from "@/features/lesson/model/lesson-catalog";
import { pendingReviewItems } from "@/features/review/model/review-plan";
import { useSoundPreference } from "@/features/sound/sound-preference";
import { stickyNoteHighlighter } from "@/features/topics/topic-colors";
import { useAppServices } from "@/infrastructure/services/app-services";
import { HomeView, type HomeLessons, type HomeViewState } from "./home-view";
import { sessionCompletionMemory, type CompletionMemory } from "./model/completion-memory";

/** Lessons for the learner's level (A2 by default), each marked done when all its items were reviewed. */
function homeLessons(
  content: Corpus,
  level: Level | null,
  states: readonly ReviewState[],
): HomeLessons {
  const reviewed = new Set(states.map((s) => s.itemId));
  const selection = lessonsForLevel(content.lessons, level);
  return {
    level: selection.level,
    items: selection.lessons.map((lesson) => ({
      id: lesson.id,
      title: lesson.title,
      topic: lesson.topic,
      done: isLessonDone(lesson, content.exercisesById, reviewed),
    })),
  };
}

/** Marks the lessons done since the index was last seen, so their check is drawn once. */
function markJustCompleted(lessons: HomeLessons, memory: CompletionMemory): HomeLessons {
  const fresh = memory.take(lessons.items.filter((l) => l.done).map((l) => l.id));
  if (fresh.size === 0) return lessons;
  return {
    ...lessons,
    items: lessons.items.map((l) => (fresh.has(l.id) ? { ...l, justCompleted: true } : l)),
  };
}

/** Loads the learner's progress from the repository every time the screen gains focus. */
export function HomeContainer({
  content = corpus,
  completionMemory = sessionCompletionMemory,
}: {
  content?: Corpus;
  /** What the index last showed as done (the app session's, by default). */
  completionMemory?: CompletionMemory;
}) {
  const { progressRepository, clock } = useAppServices();
  const router = useRouter();
  const [state, setState] = useState<HomeViewState>({ status: "loading" });
  const sound = useSoundPreference();

  const load = useCallback(() => {
    let active = true;
    Promise.all([
      progressRepository.getStreak(),
      progressRepository.getXp(),
      progressRepository.getPlacementResult(),
      progressRepository.getReviewStates(),
    ]).then(
      ([streak, xp, placement, states]) => {
        if (!active) return;
        const level = placement?.level ?? null;
        const today = clock.today();
        setState({
          status: "ready",
          pendingReviews: pendingReviewItems({ states, today, exercises: content.exercises })
            .length,
          reviewNoteColor: stickyNoteHighlighter(today),
          streakDays: isStreakAlive(streak, today) ? streak.current : 0,
          xp,
          level,
          lessons: markJustCompleted(homeLessons(content, level, states), completionMemory),
        });
      },
      (error: unknown) => {
        if (!active) return;
        console.error("Failed to load progress", error);
        setState({ status: "error" });
      },
    );
    return () => {
      active = false;
    };
  }, [progressRepository, clock, content, completionMemory]);

  useFocusEffect(load);

  return (
    <HomeView
      state={state}
      soundEnabled={sound.enabled}
      onToggleSound={sound.toggle}
      onOpenLesson={(lessonId) => router.push(`/lesson/${lessonId}`)}
      onStartPlacement={() => router.push("/placement")}
      onOpenReview={() => router.push("/review")}
      onOpenAbout={() => router.push("/about")}
    />
  );
}
