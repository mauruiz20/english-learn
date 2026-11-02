import type { Corpus } from "@english-learn/content";
import { corpus } from "@english-learn/content/corpus";
import {
  isStreakAlive,
  type LessonResult,
  type Level,
  type ReviewState,
} from "@english-learn/domain";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  isLessonDone,
  lessonExercises,
  lessonsForLevel,
} from "@/features/lesson/model/lesson-catalog";
import { lessonScore } from "@/features/lesson/model/lesson-score";
import { pendingReviewItems } from "@/features/review/model/review-plan";
import { useSoundPreference } from "@/features/sound/sound-preference";
import { useThemePreference } from "@/features/theme/theme-preference";
import { stickyNoteHighlighter } from "@/features/topics/topic-colors";
import { useProgressVersion } from "@/features/account/account-context";
import { MoveBanner } from "@/features/transfer/move-banner";
import { cardsSummary } from "@/features/cards/model/card-catalog";
import { useOriginMoveOffer } from "@/features/transfer/origin-move-gate";
import { useAppServices } from "@/infrastructure/services/app-services";
import { HomeView, type HomeLessons, type HomeViewState } from "./home-view";
import { sessionCompletionMemory, type CompletionMemory } from "./model/completion-memory";
import {
  ACHIEVEMENTS,
  achievementFacts,
  unlockedAchievements,
} from "@/features/achievements/model/achievements";

/**
 * Lessons for the learner's level (A2 by default), each marked done when all its items were
 * reviewed, with its best result from the log.
 */
function homeLessons(
  content: Corpus,
  level: Level | null,
  states: readonly ReviewState[],
  results: readonly LessonResult[],
): HomeLessons {
  const reviewed = new Set(states.map((s) => s.itemId));
  const resultById = new Map(results.map((r) => [r.lessonId, r]));
  const selection = lessonsForLevel(content.lessons, level);
  return {
    level: selection.level,
    items: selection.lessons.map((lesson) => ({
      id: lesson.id,
      title: lesson.title,
      topic: lesson.topic,
      done: isLessonDone(lesson, content.exercisesById, reviewed),
      score: lessonScore(
        resultById.get(lesson.id),
        lessonExercises(lesson, content.exercisesById).length,
      ),
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
  const theme = useThemePreference();
  const progressVersion = useProgressVersion();
  // Only on the app's old web address, while it holds progress to take along.
  const moveOffer = useOriginMoveOffer();

  const load = useCallback(() => {
    let active = true;
    Promise.all([
      progressRepository.getStreak(),
      progressRepository.getXp(),
      progressRepository.getPlacementResult(),
      progressRepository.getReviewStates(),
      progressRepository.getLessonResults(),
    ]).then(
      ([streak, xp, placement, states, results]) => {
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
          lessons: markJustCompleted(
            homeLessons(content, level, states, results),
            completionMemory,
          ),
          album: {
            unlocked: unlockedAchievements(
              achievementFacts(content, { states, xp, streak, placement }),
            ).length,
            total: ACHIEVEMENTS.length,
          },
          cards: cardsSummary(content.cards, states),
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
    // `progressVersion` is not read, only depended on: a new version (a sync brought progress
    // from another device) makes a new `load`, which `useFocusEffect` runs again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progressRepository, clock, content, completionMemory, progressVersion]);

  useFocusEffect(load);

  return (
    <HomeView
      state={state}
      soundEnabled={sound.enabled}
      onToggleSound={sound.toggle}
      themePreference={theme.preference}
      onCycleTheme={theme.cycle}
      onOpenLesson={(lessonId) => router.push(`/lesson/${lessonId}`)}
      onStartPlacement={() => router.push("/placement")}
      onOpenReview={() => router.push("/review")}
      onOpenAbout={() => router.push("/about")}
      onOpenAccount={() => router.push("/cuenta")}
      onOpenAlbum={() => router.push("/album")}
      onOpenCards={() => router.push("/fichas")}
      notice={
        moveOffer && (
          <MoveBanner
            newOrigin={moveOffer.newOrigin}
            status={moveOffer.status}
            onTake={moveOffer.take}
            onSkip={moveOffer.skip}
          />
        )
      }
    />
  );
}
