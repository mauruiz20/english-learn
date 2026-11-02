import type { Corpus } from "@english-learn/content";
import { foldEvents, isStreakAlive, type LocalDate, type StoredEvent } from "@english-learn/domain";
import { isLessonDone } from "@/features/lesson/model/lesson-catalog";

/** What a claimed transfer would bring, folded on its own, before anything is saved. */
export type TransferPreview = {
  readonly xp: number;
  readonly lessonsDone: number;
  /** The transferred streak if it is still alive today, else 0. */
  readonly streakDays: number;
  readonly firstDate: string | null;
  readonly lastDate: string | null;
  readonly events: number;
};

export function previewTransfer(
  events: readonly StoredEvent[],
  { today, content }: { today: LocalDate; content: Pick<Corpus, "lessons" | "exercisesById"> },
): TransferPreview {
  const progress = foldEvents(events);
  const reviewed = new Set(progress.states.map((s) => s.itemId));
  const dates = events.map((e) => e.localDate).sort();
  return {
    xp: progress.xp,
    lessonsDone: content.lessons.filter((l) => isLessonDone(l, content.exercisesById, reviewed))
      .length,
    streakDays: isStreakAlive(progress.streak, today) ? progress.streak.current : 0,
    firstDate: dates[0] ?? null,
    lastDate: dates.at(-1) ?? null,
    events: events.length,
  };
}

/** "2026-10-30" → "30/10/2026". */
function dayMonthYear(date: string): string {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

/** "del 28/10/2026 al 30/10/2026", "el 30/10/2026", or null without events. */
export function activityRange({
  firstDate,
  lastDate,
}: Pick<TransferPreview, "firstDate" | "lastDate">): string | null {
  if (firstDate === null || lastDate === null) return null;
  if (firstDate === lastDate) return `el ${dayMonthYear(firstDate)}`;
  return `del ${dayMonthYear(firstDate)} al ${dayMonthYear(lastDate)}`;
}
