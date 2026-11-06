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
  autoPathLevel,
  isLessonDone,
  lessonExercises,
  pathLessons,
  pathLevels,
} from "@/features/lesson/model/lesson-catalog";
import { lessonScore } from "@/features/lesson/model/lesson-score";
import { reviewOutlook } from "@/features/review/model/review-plan";
import { PronunciationSettingsButton } from "@/features/pronunciation/pronunciation-settings";
import { useSoundPreference } from "@/features/sound/sound-preference";
import { useThemePreference } from "@/features/theme/theme-preference";
import { stickyNoteHighlighter } from "@/features/topics/topic-colors";
import { useAccount, useProgressVersion } from "@/features/account/account-context";
import { MoveBanner } from "@/features/transfer/move-banner";
import { cardScores, cardsSummary } from "@/features/cards/model/card-catalog";
import { cardPath } from "@/features/cards/card-routes";
import { useOriginMoveOffer } from "@/features/transfer/origin-move-gate";
import { useAppServices } from "@/infrastructure/services/app-services";
import { HomeView, type HomeDeepenCard, type HomeLessons, type HomeViewState } from "./home-view";
import { sessionCompletionMemory, type CompletionMemory } from "./model/completion-memory";
import { deepenSteps } from "./model/deepen-steps";
import {
  homeAviState,
  sessionHomeAviMemory,
  type HomeAviMemory,
  type HomeAviState,
} from "./model/home-avi";
import {
  achievementFacts,
  albumAchievements,
  unlockedAchievements,
} from "@/features/achievements/model/achievements";

/** The lesson's linked cards (`deepenCardIds`), with their best practice result. */
function deepenCards(
  cardIds: readonly string[] | undefined,
  content: Corpus,
  scores: ReturnType<typeof cardScores>,
): HomeDeepenCard[] {
  return (cardIds ?? []).flatMap((id) => {
    const card = content.cardsById.get(id);
    if (card === undefined) return [];
    const score = scores.get(id);
    return [{ id, title: card.title, ...(score === undefined ? {} : { score }) }];
  });
}

/**
 * Lessons on the learner's path (the level picked by hand, or else the automatic level; see
 * `pathLessons` and `autoPathLevel`), each marked done when all its items were reviewed, with its
 * best result from the log and, once done, the cards that go deeper into it (each card once, see
 * `deepenSteps`). Also every lesson done on any level, for `markJustCompleted`.
 */
function homeLessons(
  content: Corpus,
  level: Level | null,
  states: readonly ReviewState[],
  results: readonly LessonResult[],
  chosenLevel: Level | null,
): { lessons: HomeLessons; doneIds: string[] } {
  const reviewed = new Set(states.map((s) => s.itemId));
  const doneIds = content.lessons
    .filter((lesson) => isLessonDone(lesson, content.exercisesById, reviewed))
    .map((lesson) => lesson.id);
  const doneSet = new Set(doneIds);
  const isDone = (lesson: { id: string }) => doneSet.has(lesson.id);
  const resultById = new Map(results.map((r) => [r.lessonId, r]));
  const selection = pathLessons(content.lessons, level, isDone, chosenLevel);
  const levels = pathLevels(content.lessons, isDone);
  const scores = cardScores(content, results);
  const stops = selection.lessons.map((lesson) => ({ lesson, done: isDone(lesson) }));
  // Each card once on the path, under the earliest done lesson that links it.
  const steps = deepenSteps(
    stops.map(({ lesson, done }) => ({ id: lesson.id, done, deepenCardIds: lesson.deepenCardIds })),
  );
  const lessons: HomeLessons = {
    level: selection.level,
    autoLevel: autoPathLevel(content.lessons, level, isDone),
    chosen: chosenLevel !== null && levels.some((l) => l.level === chosenLevel),
    levels,
    items: stops.map(({ lesson, done }) => {
      const deepen = deepenCards(steps.get(lesson.id), content, scores);
      return {
        id: lesson.id,
        title: lesson.title,
        topic: lesson.topic,
        done,
        score: lessonScore(
          resultById.get(lesson.id),
          lessonExercises(lesson, content.exercisesById).length,
        ),
        ...(deepen.length === 0 ? {} : { deepen }),
      };
    }),
  };
  return { lessons, doneIds };
}

/**
 * Marks the lessons done since the index was last seen, so their check is drawn once. It
 * remembers the lessons done on every level, so showing another level draws nothing again.
 */
function markJustCompleted(
  { lessons, doneIds }: { lessons: HomeLessons; doneIds: readonly string[] },
  memory: CompletionMemory,
): HomeLessons {
  const fresh = memory.take(doneIds);
  if (fresh.size === 0) return lessons;
  return {
    ...lessons,
    items: lessons.items.map((l) => (fresh.has(l.id) ? { ...l, justCompleted: true } : l)),
  };
}

const QUIET_AVI = {
  kind: "idle",
  mood: "happy",
  bubble: null,
  moment: null,
} as const satisfies HomeAviState;

/** Loads the learner's progress from the repository every time the screen gains focus. */
export function HomeContainer({
  content = corpus,
  completionMemory = sessionCompletionMemory,
  aviMemory = sessionHomeAviMemory,
}: {
  content?: Corpus;
  /** What the index last showed as done (the app session's, by default). */
  completionMemory?: CompletionMemory;
  /** The badges home last showed (the app session's, by default). */
  aviMemory?: HomeAviMemory;
}) {
  const { progressRepository, settingsRepository, clock } = useAppServices();
  const router = useRouter();
  const [state, setState] = useState<HomeViewState>({ status: "loading" });
  // Avi beside the greeting: idle and quiet until the progress says more.
  const [avi, setAvi] = useState<HomeAviState>(QUIET_AVI);
  // Home is the focused screen (Avi's bob and blink pause under another screen).
  const [focused, setFocused] = useState(true);
  const sound = useSoundPreference();
  const theme = useThemePreference();
  const progressVersion = useProgressVersion();
  const { session } = useAccount();
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
      // A view preference: unreadable or failing, the path follows the automatic level.
      settingsRepository.getPathLevel().catch(() => null),
      // A settings read that fails only costs Avi's "welcome back".
      settingsRepository.getLastHomeVisit().catch(() => null),
    ]).then(
      ([streak, xp, placement, states, results, chosenLevel, lastHomeVisit]) => {
        if (!active) return;
        // Every event leaves a trace here (a baseline always holds progress), so an empty store
        // (a new device before its first sync pull) decides nothing yet.
        const hasProgress =
          states.length > 0 ||
          xp > 0 ||
          placement !== null ||
          streak.lastActiveDate !== null ||
          results.length > 0;
        const level = placement?.level ?? null;
        const today = clock.today();
        // Exactly what `/review` will serve next (same plan), and what later reviews serve today.
        const outlook = reviewOutlook({ states, today, exercises: content.exercises });
        const pendingReviews = outlook.next;
        const lessons = markJustCompleted(
          homeLessons(content, level, states, results, chosenLevel),
          completionMemory,
        );
        const badges = unlockedAchievements(
          achievementFacts(content, { states, xp, streak, placement }),
        );
        const news = aviMemory.take({ badges });
        setAvi(
          homeAviState({
            today,
            hour: new Date(clock.nowMs()).getHours(),
            streak,
            lastHomeVisit,
            pendingReviews,
            hasProgress,
            news: { ...news, lessonDone: lessons.items.some((l) => l.justCompleted === true) },
          }),
        );
        if (lastHomeVisit !== today) {
          settingsRepository.setLastHomeVisit(today).catch((error: unknown) => {
            console.error("Failed to remember the home visit", error);
          });
        }
        setState({
          status: "ready",
          pendingReviews,
          laterReviews: outlook.later,
          reviewNoteColor: stickyNoteHighlighter(today),
          streakDays: isStreakAlive(streak, today) ? streak.current : 0,
          xp,
          level,
          lessons,
          album: {
            unlocked: badges.length,
            total: albumAchievements(content).length,
          },
          cards: cardsSummary(content.cards, states),
          practiceTopics: content.practice.map((c) => c.title),
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
  }, [
    progressRepository,
    settingsRepository,
    clock,
    content,
    completionMemory,
    aviMemory,
    progressVersion,
  ]);

  useFocusEffect(load);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  // Shows the picked level's path once the choice is stored (null: the automatic level again).
  const choosePathLevel = useCallback(
    (chosen: Level | null) => {
      settingsRepository.setPathLevel(chosen).then(load, (error: unknown) => {
        console.error("Failed to save the path level", error);
      });
    },
    [settingsRepository, load],
  );

  return (
    <HomeView
      state={state}
      greetingName={session.status === "signed-in" ? session.account.givenName : undefined}
      avi={{ state: avi, active: focused }}
      soundEnabled={sound.enabled}
      onToggleSound={sound.toggle}
      themePreference={theme.preference}
      onCycleTheme={theme.cycle}
      pronunciationControl={<PronunciationSettingsButton />}
      onOpenLesson={(lessonId) => router.push(`/lesson/${lessonId}`)}
      onStartPlacement={() => router.push("/placement")}
      onOpenReview={() => router.push("/review")}
      onOpenAbout={() => router.push("/about")}
      onOpenAccount={() => router.push("/cuenta")}
      onOpenAlbum={() => router.push("/album")}
      onOpenCards={() => router.push("/fichas")}
      onOpenPractice={() => router.push("/practica")}
      onOpenProgress={() => router.push("/progreso")}
      onOpenCard={(cardId) => router.push(cardPath(cardId))}
      onChoosePathLevel={choosePathLevel}
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
