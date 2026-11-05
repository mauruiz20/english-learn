import type { Corpus } from "@english-learn/content";
import { corpus } from "@english-learn/content/corpus";
import {
  isStreakAlive,
  type LessonResult,
  type Level,
  type Outfit,
  type ReviewState,
} from "@english-learn/domain";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { wardrobeFromRewards } from "@/features/wardrobe/model/wardrobe";
import { isLessonDone, lessonExercises, pathLessons } from "@/features/lesson/model/lesson-catalog";
import { lessonScore } from "@/features/lesson/model/lesson-score";
import { pendingReviewItems } from "@/features/review/model/review-plan";
import { useSoundPreference } from "@/features/sound/sound-preference";
import { useThemePreference } from "@/features/theme/theme-preference";
import { stickyNoteHighlighter } from "@/features/topics/topic-colors";
import { useAccount, useProgressVersion } from "@/features/account/account-context";
import { MoveBanner } from "@/features/transfer/move-banner";
import { cardScores, cardsSummary } from "@/features/cards/model/card-catalog";
import { cardPath } from "@/features/cards/card-routes";
import { useOriginMoveOffer } from "@/features/transfer/origin-move-gate";
import { useAppServices } from "@/infrastructure/services/app-services";
import { PlumasWelcomeNote } from "@/features/rewards/plumas-welcome-note";
import { HomeView, type HomeDeepenCard, type HomeLessons, type HomeViewState } from "./home-view";
import { sessionCompletionMemory, type CompletionMemory } from "./model/completion-memory";
import { deepenSteps } from "./model/deepen-steps";
import {
  homeAviLabel,
  homeAviState,
  sessionHomeAviMemory,
  type HomeAviMemory,
  type HomeAviState,
} from "./model/home-avi";
import {
  ACHIEVEMENTS,
  achievementFacts,
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
 * Lessons on the learner's path (their level, A2 by default, moving on to the next level with
 * lessons once every lesson of it is done; see `pathLessons`), each marked done when all its
 * items were reviewed, with its best result from the log and, once done, the cards that go
 * deeper into it (each card once, see `deepenSteps`).
 */
function homeLessons(
  content: Corpus,
  level: Level | null,
  states: readonly ReviewState[],
  results: readonly LessonResult[],
): HomeLessons {
  const reviewed = new Set(states.map((s) => s.itemId));
  const resultById = new Map(results.map((r) => [r.lessonId, r]));
  const selection = pathLessons(content.lessons, level, (lesson) =>
    isLessonDone(lesson, content.exercisesById, reviewed),
  );
  const scores = cardScores(content, results);
  const stops = selection.lessons.map((lesson) => ({
    lesson,
    done: isLessonDone(lesson, content.exercisesById, reviewed),
  }));
  // Each card once on the path, under the earliest done lesson that links it.
  const steps = deepenSteps(
    stops.map(({ lesson, done }) => ({ id: lesson.id, done, deepenCardIds: lesson.deepenCardIds })),
  );
  return {
    level: selection.level,
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

const QUIET_AVI = {
  state: { kind: "idle", mood: "happy", bubble: null, moment: null },
  outfit: {},
} as const satisfies { state: HomeAviState; outfit: Outfit };

/** Loads the learner's progress from the repository every time the screen gains focus. */
export function HomeContainer({
  content = corpus,
  completionMemory = sessionCompletionMemory,
  aviMemory = sessionHomeAviMemory,
}: {
  content?: Corpus;
  /** What the index last showed as done (the app session's, by default). */
  completionMemory?: CompletionMemory;
  /** The badges, items and outfit home last showed (the app session's, by default). */
  aviMemory?: HomeAviMemory;
}) {
  const { progressRepository, settingsRepository, clock } = useAppServices();
  const router = useRouter();
  const [state, setState] = useState<HomeViewState>({ status: "loading" });
  // The baseline's plumas grant, for the one-time note: null until there is progress to decide on.
  const [welcome, setWelcome] = useState<number | null>(null);
  // Avi beside the greeting: idle and quiet until the progress says more.
  const [avi, setAvi] = useState<{ state: HomeAviState; outfit: Outfit }>(QUIET_AVI);
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
      progressRepository.getRewards(),
      // A settings read that fails only costs Avi's "welcome back".
      settingsRepository.getLastHomeVisit().catch(() => null),
    ]).then(
      ([streak, xp, placement, states, results, rewards, lastHomeVisit]) => {
        if (!active) return;
        // Every event leaves a trace here (a baseline always holds progress), so an empty store
        // (a new device before its first sync pull) decides nothing yet.
        const hasProgress =
          states.length > 0 ||
          xp > 0 ||
          placement !== null ||
          streak.lastActiveDate !== null ||
          results.length > 0 ||
          rewards.earned > 0 ||
          rewards.spent > 0 ||
          Object.keys(rewards.equipped).length > 0;
        setWelcome(hasProgress ? rewards.earnedBySource.welcome : null);
        const level = placement?.level ?? null;
        const today = clock.today();
        const pendingReviews = pendingReviewItems({
          states,
          today,
          exercises: content.exercises,
        }).length;
        const lessons = markJustCompleted(
          homeLessons(content, level, states, results),
          completionMemory,
        );
        const badges = unlockedAchievements(
          achievementFacts(content, { states, xp, streak, placement }),
        );
        const { outfit } = wardrobeFromRewards(rewards);
        const news = aviMemory.take({
          badges,
          owned: rewards.ownedItemIds,
          outfit,
        });
        setAvi({
          state: homeAviState({
            today,
            hour: new Date(clock.nowMs()).getHours(),
            streak,
            lastHomeVisit,
            pendingReviews,
            hasProgress,
            news: { ...news, lessonDone: lessons.items.some((l) => l.justCompleted === true) },
          }),
          outfit,
        });
        if (lastHomeVisit !== today) {
          settingsRepository.setLastHomeVisit(today).catch((error: unknown) => {
            console.error("Failed to remember the home visit", error);
          });
        }
        setState({
          status: "ready",
          pendingReviews,
          reviewNoteColor: stickyNoteHighlighter(today),
          streakDays: isStreakAlive(streak, today) ? streak.current : 0,
          xp,
          plumas: rewards.balance,
          level,
          lessons,
          album: {
            unlocked: badges.length,
            total: ACHIEVEMENTS.length,
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

  return (
    <HomeView
      state={state}
      greetingName={session.status === "signed-in" ? session.account.givenName : undefined}
      avi={{
        state: avi.state,
        label: homeAviLabel(avi.state, avi.outfit),
        active: focused,
      }}
      plumasNote={<PlumasWelcomeNote welcome={welcome} />}
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
      onOpenPractice={() => router.push("/practica")}
      onOpenWardrobe={() => router.push("/armario")}
      onOpenCard={(cardId) => router.push(cardPath(cardId))}
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
