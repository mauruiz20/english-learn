import { isStreakAlive, type LocalDate, type Streak } from "@english-learn/domain";
import type { AviMood } from "@/shared/ui/mascot";

/**
 * Avi beside the home greeting (`docs/design/avi-rewards.md`, section 5.1): what it feels, says
 * and does when home gains focus. Positive only: a broken streak is never named in numbers, and
 * nothing is offered to fix it.
 */
export type HomeAviKind = "celebrate" | "missed-you" | "welcome-back" | "resting" | "idle";

/** The one moment Avi plays when it enters a state (none with reduced motion). */
export type HomeAviMoment = "hop" | "loop" | "droop" | "wave";

export type HomeAviState = {
  readonly kind: HomeAviKind;
  readonly mood: AviMood;
  /** One short line in a speech bubble, or nothing to say. */
  readonly bubble: string | null;
  readonly moment: HomeAviMoment | null;
};

/** What changed since home was last seen in this app session. */
export type HomeAviNews = {
  /** A lesson on the path was completed (`completion-memory.ts`). */
  readonly lessonDone: boolean;
  /** A new album badge. */
  readonly badge: boolean;
};

export const NO_NEWS: HomeAviNews = { lessonDone: false, badge: false };

export type HomeAviInput = {
  readonly today: LocalDate;
  /** The local hour, 0–23. */
  readonly hour: number;
  readonly streak: Streak;
  /** The date home was last opened on this device (before this visit), null on the first. */
  readonly lastHomeVisit: LocalDate | null;
  /** Items the daily review would practice today. */
  readonly pendingReviews: number;
  /** Anything stored at all (a fresh learner has nothing). */
  readonly hasProgress: boolean;
  readonly news: HomeAviNews;
};

/** From 22:00 to 05:59 Avi is sleepy. */
const isNight = (hour: number) => hour >= 22 || hour < 6;

/** The state for this visit: the first match of section 5.1's table wins. */
export function homeAviState(input: HomeAviInput): HomeAviState {
  const { today, streak, news } = input;
  const studiedToday = streak.lastActiveDate === today;
  if (news.lessonDone || news.badge) {
    return {
      kind: "celebrate",
      mood: "cheer",
      bubble: "¡Lo lograste!",
      moment: news.badge ? "loop" : "hop",
    };
  }
  if (!isStreakAlive(streak, today) && streak.longest > 0 && !studiedToday) {
    return {
      kind: "missed-you",
      mood: "sad",
      bubble: "Te extrañé. Hoy empezamos una racha nueva.",
      moment: "droop",
    };
  }
  if (input.lastHomeVisit !== null && input.lastHomeVisit < today) {
    return { kind: "welcome-back", mood: "happy", bubble: "¡Qué bueno verte!", moment: "wave" };
  }
  if (studiedToday && input.pendingReviews === 0) {
    return { kind: "resting", mood: "sleepy", bubble: "Todo listo por hoy.", moment: null };
  }
  if (isNight(input.hour)) {
    return {
      kind: "resting",
      mood: "sleepy",
      bubble: "Ya es tarde. ¡Que descanses!",
      moment: null,
    };
  }
  const bubble = !input.hasProgress
    ? "¡Hola! Soy Avi. ¿Empezamos?"
    : input.pendingReviews > 0
      ? "¿Repasamos un poco?"
      : null;
  return { kind: "idle", mood: "happy", bubble, moment: null };
}

/** What home last showed, to tell what is new. */
export type HomeAviSnapshot = {
  readonly badges: readonly string[];
};

export type HomeAviMemory = {
  /** What is new since the last call (nothing on the first), remembering `now` as seen. */
  take(now: HomeAviSnapshot): HomeAviNews;
};

/**
 * Remembers, in memory, the badges home last showed. Like the completion memory, the first look
 * of a session finds nothing new (a reload celebrates nothing).
 */
export function createHomeAviMemory(): HomeAviMemory {
  let seen: HomeAviSnapshot | null = null;
  return {
    take(now) {
      const before = seen;
      seen = now;
      if (before === null) return NO_NEWS;
      return { lessonDone: false, badge: now.badges.some((id) => !before.badges.includes(id)) };
    },
  };
}

/** The app session's memory. */
export const sessionHomeAviMemory = createHomeAviMemory();
