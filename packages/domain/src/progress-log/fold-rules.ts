import { canonicalJson } from "./canonical";
import type { StoredEvent } from "./events";
import { FOLD_SNAPSHOT_VERSION, foldSnapshot } from "./fold";

type Envelope = Pick<StoredEvent, "id" | "deviceId" | "occurredAt" | "localDate">;

const at = (id: string, localDate: string, occurredAt = 1_000, deviceId = "A"): Envelope => ({
  id,
  deviceId,
  occurredAt,
  localDate,
});

const review = (e: Envelope, sessionId: string, itemId: string, grade: number): StoredEvent => ({
  ...e,
  type: "item_reviewed",
  payload: { v: 1, sessionId, itemId, grade },
});

const lesson = (
  e: Envelope,
  sessionId: string,
  lessonId: string,
  answerXp: number,
  accuracy: number,
  exercises?: number,
): StoredEvent => ({
  ...e,
  type: "session_completed",
  payload: {
    v: 1,
    sessionId,
    kind: "lesson",
    lessonId,
    answerXp,
    accuracy,
    ...(exercises === undefined ? {} : { exercises }),
  },
});

const reviewSession = (
  e: Envelope,
  sessionId: string,
  answerXp: number,
  exercises?: number,
): StoredEvent => ({
  ...e,
  type: "session_completed",
  payload: {
    v: 1,
    sessionId,
    kind: "review",
    answerXp,
    accuracy: 0.5,
    ...(exercises === undefined ? {} : { exercises }),
  },
});

/** An event of a retired type (`RETIRED_EVENT_TYPES`). */
const retired = (e: Envelope, type: string, payload: unknown): StoredEvent => ({
  ...e,
  type,
  payload,
});

/**
 * A fixed log that exercises every fold rule (SM-2 reviews and lapses, answer XP, the lesson
 * bonus, baselines, streak, placement, lesson results, daily exercises, retired types and every
 * anomaly). Its fold is pinned by a golden test, and
 * `foldRulesFingerprint` hashes it.
 */
export const FOLD_RULES_CORPUS: readonly StoredEvent[] = [
  {
    ...at("r00", "2026-01-01"),
    type: "baseline_imported",
    payload: {
      v: 1,
      states: [
        {
          itemId: "i1",
          ease: 2.36,
          intervalDays: 6,
          reps: 2,
          lapses: 0,
          dueDate: "2026-01-04",
        },
      ],
      xp: 100,
      streak: { current: 2, longest: 5, lastActiveDate: "2025-12-31" },
      placement: { level: "A2", theta: -0.7 },
      completedLessonIds: ["L0"],
    },
  },
  review(at("r01", "2026-01-02"), "s1", "i1", 5),
  review(at("r02", "2026-01-02"), "s1", "i2", 3),
  review(at("r03", "2026-01-02"), "s1", "i3", 1),
  review(at("r04", "2026-01-02"), "s1", "i2", 0),
  lesson(at("r05", "2026-01-02"), "s1", "L1", 30, 0.75),
  review(at("r06", "2026-01-03"), "s2", "i2", 4),
  lesson(at("r07", "2026-01-03"), "s2", "L0", 10, 1),
  {
    ...at("r08", "2026-01-04", 500, "B"),
    type: "baseline_imported",
    payload: {
      v: 1,
      states: [
        {
          itemId: "i4",
          ease: 2.5,
          intervalDays: 1,
          reps: 1,
          lapses: 0,
          dueDate: "2026-01-05",
        },
      ],
      xp: 40,
      streak: { current: 1, longest: 1, lastActiveDate: "2026-01-03" },
      placement: null,
    },
  },
  review(at("r09", "2026-01-05"), "s3", "i1", 2),
  review(at("r10", "2026-01-05"), "s3", "i3", 5),
  reviewSession(at("r11", "2026-01-05"), "s3", 20, 2),
  // A repeated session: its XP and exercises count once.
  reviewSession(at("r12", "2026-01-05", 2_000), "s3", 99, 9),
  review(at("r13", "2026-01-05", 3_000), "s4", "i4", 5),
  lesson(at("r14", "2026-01-05", 3_000), "s4", "L1", 25, 1, 6),
  {
    ...at("r15", "2026-01-06"),
    type: "placement_completed",
    payload: { v: 1, level: "B1", theta: 0.4 },
  },
  {
    ...at("r16", "2026-01-06"),
    type: "answer_disputed",
    payload: { v: 1, exerciseId: "x1", itemIds: ["i2"], answer: "my answer", accepted: false },
  },
  { ...at("r17", "2026-01-06"), type: "streak_frozen", payload: { v: 1 } },
  // A newer app's payload version: unsupported.
  { ...at("r18", "2026-01-06"), type: "session_completed", payload: { v: 2, sessionId: "s9" } },
  { ...at("r19", "2026-01-06"), type: "item_reviewed", payload: { v: 2, sessionId: "s9" } },
  review(at("r20", "2026-01-06"), "s5", "i9", 9),
  // Same id as r01 with other content: conflicting duplicate.
  review(at("r01", "2026-01-07"), "s1", "i1", 0),
  // Identical copy of r10: folds once, no anomaly.
  review(at("r10", "2026-01-05"), "s3", "i3", 5),
  // Unorderable envelope.
  review(at("r21", "2026-13-40"), "s6", "i1", 5),
  review(at("r22", "2026-01-09"), "s7", "i2", 5),
  review(at("r23", "2026-01-09"), "s7", "i5", 4),
  lesson(at("r24", "2026-01-09"), "s7", "L2", 40, 0.5, 8),
  // An exercise count that is not a non-negative integer: invalid.
  lesson(at("r25", "2026-01-09"), "s8", "L3", 10, 1, -2),
  // Retired types (Avi's withdrawn wardrobe), as an older app wrote them, plus a malformed copy:
  // ignored, never reported.
  retired(at("w01", "2026-01-10"), "item_purchased", { v: 1, itemId: "gorra", price: 80 }),
  retired(at("w02", "2026-01-10"), "item_equipped", { v: 1, slot: "head", itemId: "gorra" }),
  retired(at("w03", "2026-01-10"), "item_equipped", { v: 2, slot: 7 }),
  {
    ...at("c01", "2026-01-11"),
    type: "checkpoint_completed",
    payload: { v: 1, checkpointId: "introductions", lessonId: "L1", correct: 2, total: 3 },
  },
];

/** 32-bit FNV-1a of the UTF-16 code units, as 8 hex digits. */
function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

let fingerprint: string | undefined;

/**
 * Identifies the fold rules this build ships: `v<FOLD_SNAPSHOT_VERSION>-<hash of the fold of
 * FOLD_RULES_CORPUS>`. A store keeps it with its snapshot and refolds when it differs, so an
 * update that changes any rule the corpus exercises (in the fold, SRS, scoring or validation)
 * re-derives the cache even if the version was not bumped.
 */
export function foldRulesFingerprint(): string {
  fingerprint ??= `v${FOLD_SNAPSHOT_VERSION}-${fnv1a(canonicalJson(foldSnapshot(FOLD_RULES_CORPUS)))}`;
  return fingerprint;
}
