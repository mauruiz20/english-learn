import {
  WARDROBE_SLOTS,
  catalogItem,
  isStreakAlive,
  type LocalDate,
  type Outfit,
  type Streak,
  type WardrobeSlot,
} from "@english-learn/domain";
import type { AviMood } from "@/shared/ui/mascot";

/**
 * Avi beside the home greeting (`docs/design/avi-rewards.md`, section 5.1): what it feels, says
 * and does when home gains focus. Positive only: a broken streak is never named in numbers, and
 * nothing is offered to fix it.
 */
export type HomeAviKind =
  "celebrate" | "new-outfit" | "missed-you" | "welcome-back" | "resting" | "idle";

/** The one moment Avi plays when it enters a state (none with reduced motion). */
export type HomeAviMoment = "hop" | "loop" | "twirl" | "droop" | "wave";

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
  /** A newly bought item. */
  readonly item: boolean;
  /** Avi's clothes changed (back from the wardrobe). */
  readonly outfitChanged: boolean;
};

export const NO_NEWS: HomeAviNews = {
  lessonDone: false,
  badge: false,
  item: false,
  outfitChanged: false,
};

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
  if (news.outfitChanged || news.item) {
    return { kind: "new-outfit", mood: "cheer", bubble: "¿Cómo me veo?", moment: "twirl" };
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
  readonly owned: readonly string[];
  readonly outfit: Outfit;
};

export type HomeAviMemory = {
  /** What is new since the last call (nothing on the first), remembering `now` as seen. */
  take(now: HomeAviSnapshot): HomeAviNews;
};

const outfitKey = (outfit: Outfit) => WARDROBE_SLOTS.map((slot) => outfit[slot] ?? "").join("|");

/**
 * Remembers, in memory, the badges, items and outfit home last showed. Like the completion
 * memory, the first look of a session finds nothing new (a reload celebrates nothing).
 */
export function createHomeAviMemory(): HomeAviMemory {
  let seen: HomeAviSnapshot | null = null;
  return {
    take(now) {
      const before = seen;
      seen = now;
      if (before === null) return NO_NEWS;
      const isNew = (ids: readonly string[], old: readonly string[]) =>
        ids.some((id) => !old.includes(id));
      return {
        lessonDone: false,
        badge: isNew(now.badges, before.badges),
        item: isNew(now.owned, before.owned),
        outfitChanged: outfitKey(now.outfit) !== outfitKey(before.outfit),
      };
    },
  };
}

/** The app session's memory. */
export const sessionHomeAviMemory = createHomeAviMemory();

const SLOT_ORDER: readonly WardrobeSlot[] = ["head", "neck", "eyes", "paper", "sticker"];

/** "con gorra, bufanda de rayas y sticker de estrella"; empty when Avi wears nothing known. */
export function outfitDescription(outfit: Outfit): string {
  const names = SLOT_ORDER.flatMap((slot) => {
    const id = outfit[slot];
    const item = id === undefined ? undefined : catalogItem(id);
    if (item === undefined) return [];
    const name = item.name.charAt(0).toLowerCase() + item.name.slice(1);
    return [slot === "sticker" ? `sticker de ${name}` : name];
  });
  if (names.length === 0) return "";
  const last = names.pop()!;
  return `con ${names.length === 0 ? last : `${names.join(", ")} y ${last}`}`;
}

const FEELINGS: Readonly<Record<HomeAviKind, string>> = {
  celebrate: "celebrando",
  "new-outfit": "estrenando ropa",
  "missed-you": "con ganas de verte",
  "welcome-back": "contento de verte",
  resting: "con sueño",
  idle: "contento",
};

/** The hero button's name: "Avi, contento, con gorra y bufanda de rayas. Abre el armario". */
export function homeAviLabel(state: HomeAviState, outfit: Outfit): string {
  const worn = outfitDescription(outfit);
  return `Avi, ${FEELINGS[state.kind]}${worn === "" ? "" : `, ${worn}`}. Abre el armario`;
}
