import type { Corpus } from "@english-learn/content";
import { uuidv7, type Clock } from "@english-learn/domain";
import {
  createSqliteProgressRepository,
  migrate,
  type SqlDatabase,
  type SqliteProgressRepository,
} from "@english-learn/storage-sqlite";
import { isLessonDone } from "@/features/lesson/model/lesson-catalog";
import { baselineImportedEvent, type RandomBytes } from "@/features/progress/progress-events";

export type InitProgressStoreOptions = {
  readonly clock: Clock;
  readonly randomBytes: RandomBytes;
  /** Lessons and exercises, to know which lessons an upgraded learner already completed. */
  readonly content: Pick<Corpus, "lessons" | "exercisesById">;
};

/**
 * Prepares the on-device progress store on every app start: runs migrations, generates this
 * install's device id once, and — for progress written before the event log — stores ONE
 * `baseline_imported` event. Its `completedLessonIds` are the lessons whose items all have a
 * review state (what the home screen shows as done), so replaying them earns no bonus again.
 * Idempotent; resolves to the repository it prepared.
 */
export async function initProgressStore(
  db: SqlDatabase,
  { clock, randomBytes, content }: InitProgressStoreOptions,
): Promise<SqliteProgressRepository> {
  await migrate(db);
  const repository = createSqliteProgressRepository(db);
  const deviceId = await repository.ensureDeviceId(() => uuidv7(clock.nowMs(), randomBytes));
  await repository.ensureBaseline((cache) => {
    const reviewed = new Set(cache.states.map((s) => s.itemId));
    const completedLessonIds = content.lessons
      .filter((lesson) => isLessonDone(lesson, content.exercisesById, reviewed))
      .map((lesson) => lesson.id)
      .sort();
    const stamp = { deviceId, occurredAt: clock.nowMs(), localDate: clock.today(), randomBytes };
    return baselineImportedEvent(stamp, { ...cache, completedLessonIds });
  });
  return repository;
}
