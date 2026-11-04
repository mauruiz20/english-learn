import { compareLocalDate, type LocalDate } from "../local-date";
import type { PlacementResult } from "../ports";
import { DAILY_REVIEW_MIN_ACCURACY, EMPTY_REWARDS, type Rewards } from "../rewards";
import { xpForLessonCompletion } from "../scoring";
import { applyReview, type ReviewState } from "../srs";
import { EMPTY_STREAK, recordActivity, type Streak } from "../streak";
import { canonicalJson } from "./canonical";
import type { BaselineImportedEvent, ProgressEvent, StoredEvent } from "./events";
import {
  EMPTY_REWARDS_SNAPSHOT,
  RewardsLedger,
  rewardsOf,
  type RewardsSnapshot,
} from "./rewards-ledger";
import { parseEvent, validEnvelope } from "./validate";

export type FoldAnomalyKind =
  /** Same event id with different content: the first in fold order is kept. */
  | "conflicting_duplicate"
  /** Unknown `type` or payload `v` (written by a newer app): skipped. */
  | "unsupported_event"
  /** Known type and version with malformed fields or envelope: skipped. */
  | "invalid_event"
  /** A second `item_reviewed` for the same session and item: skipped. */
  | "duplicate_item_review"
  /** A second `session_completed` for the same sessionId: skipped (never paid twice). */
  | "duplicate_session";

export type FoldAnomaly = {
  readonly kind: FoldAnomalyKind;
  readonly eventId: string;
  readonly detail: string;
};

/** How a learner has done in one lesson, over every time they completed it. */
export type LessonResult = {
  readonly lessonId: string;
  /** The best `accuracy` of its `session_completed` events (share of fully correct answers). */
  readonly bestAccuracy: number;
  /** How many distinct sessions completed it. */
  readonly completions: number;
};

/** The learner's progress, derived entirely from the event log. */
export type ProgressState = {
  /** One state per reviewed item, sorted by itemId. */
  readonly states: readonly ReviewState[];
  readonly xp: number;
  readonly streak: Streak;
  readonly placement: PlacementResult | null;
  /** Sorted unique local dates with at least one completed session. */
  readonly activeDates: readonly LocalDate[];
  /** Sorted lesson ids that already earned (or, per a baseline, must not earn) the bonus. */
  readonly completedLessonIds: readonly string[];
  /**
   * One result per lesson completed in a `session_completed` event, sorted by lessonId (lessons a
   * baseline lists have none: pre-event storage kept no score).
   */
  readonly lessonResults: readonly LessonResult[];
  /** Plumas earned and spent, items owned and worn (see `RewardsLedger`). */
  readonly rewards: Rewards;
  /** Events that were skipped, in fold order. Never thrown. */
  readonly anomalies: readonly FoldAnomaly[];
};

export const EMPTY_PROGRESS: ProgressState = {
  states: [],
  xp: 0,
  streak: EMPTY_STREAK,
  placement: null,
  activeDates: [],
  completedLessonIds: [],
  lessonResults: [],
  rewards: EMPTY_REWARDS,
  anomalies: [],
};

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Where an orderable event sits in the fold's total order. */
export type FoldPosition = {
  readonly localDate: string;
  readonly occurredAt: number;
  readonly id: string;
  /** Canonical JSON of the whole event: the last tie-break, so the order is total. */
  readonly key: string;
};

type Keyed = { readonly event: StoredEvent; readonly key: string };

function positionOf({ event, key }: Keyed): FoldPosition {
  return { localDate: event.localDate, occurredAt: event.occurredAt, id: event.id, key };
}

/** Total order `(localDate, occurredAt, id)`, then canonical content so the sort is total. */
function comparePositions(a: FoldPosition, b: FoldPosition): number {
  return (
    compareLocalDate(a.localDate as LocalDate, b.localDate as LocalDate) ||
    a.occurredAt - b.occurredAt ||
    byText(a.id, b.id) ||
    byText(a.key, b.key)
  );
}

/** `comparePositions` of two events, without building their positions (it runs in sorts). */
function compareEvents(a: Keyed, b: Keyed): number {
  return (
    compareLocalDate(a.event.localDate as LocalDate, b.event.localDate as LocalDate) ||
    a.event.occurredAt - b.event.occurredAt ||
    byText(a.event.id, b.event.id) ||
    byText(a.key, b.key)
  );
}

/**
 * Keeps, per item, the state scheduled furthest ahead (latest `dueDate`), then the one with more
 * `reps`; on a full tie the state already folded stays.
 */
function preferState(current: ReviewState | undefined, incoming: ReviewState): boolean {
  if (current === undefined) return true;
  const byDue = compareLocalDate(incoming.dueDate, current.dueDate);
  return byDue > 0 || (byDue === 0 && incoming.reps > current.reps);
}

/**
 * Commutative merge of baseline streaks: longest = max; current and lastActiveDate come from the
 * most recent lastActiveDate (the larger current on a tie).
 */
function mergeStreaks(a: Streak, b: Streak): Streak {
  const longest = Math.max(a.longest, b.longest);
  const order =
    a.lastActiveDate === b.lastActiveDate
      ? 0
      : a.lastActiveDate === null
        ? -1
        : b.lastActiveDate === null
          ? 1
          : compareLocalDate(a.lastActiveDate, b.lastActiveDate);
  if (order === 0) return { ...a, current: Math.max(a.current, b.current), longest };
  const recent = order > 0 ? a : b;
  return { current: recent.current, longest, lastActiveDate: recent.lastActiveDate };
}

/** The snapshot format; a stored snapshot of another version is discarded (refold). */
export const FOLD_SNAPSHOT_VERSION = 2;

/**
 * Everything the fold knows after the events it applied, as plain JSON-safe data, so later
 * events can be applied on top (`advanceFold`) instead of refolding the whole log. Arrays are
 * sorted, so equal folds give equal snapshots.
 */
export type FoldSnapshot = {
  readonly v: typeof FOLD_SNAPSHOT_VERSION;
  /** The last orderable event in fold order; `null` before any. */
  readonly cursor: FoldPosition | null;
  readonly states: readonly ReviewState[];
  /** XP so far (answer XP, baselines, lesson bonuses). */
  readonly xp: number;
  /** Merged streak of the baselines; the streak replays `activeDates` from it. */
  readonly baselineStreak: Streak;
  readonly placement: PlacementResult | null;
  readonly activeDates: readonly LocalDate[];
  readonly completedLessonIds: readonly string[];
  readonly lessonResults: readonly LessonResult[];
  /** Sessions with a `session_completed` applied (a later one is a `duplicate_session`). */
  readonly completedSessionIds: readonly string[];
  /** Sessions with an `item_reviewed` applied (a later review of one needs a refold). */
  readonly reviewedSessionIds: readonly string[];
  /** Plumas, purchases and equips so far, with the per-day state the next events need. */
  readonly rewards: RewardsSnapshot;
  /** Unorderable events, reported first and sorted by content. */
  readonly envelopeAnomalies: readonly FoldAnomaly[];
  /** The other skipped events, in fold order. */
  readonly anomalies: readonly FoldAnomaly[];
};

export const EMPTY_FOLD_SNAPSHOT: FoldSnapshot = {
  v: FOLD_SNAPSHOT_VERSION,
  cursor: null,
  states: [],
  xp: 0,
  baselineStreak: EMPTY_STREAK,
  placement: null,
  activeDates: [],
  completedLessonIds: [],
  lessonResults: [],
  completedSessionIds: [],
  reviewedSessionIds: [],
  rewards: EMPTY_REWARDS_SNAPSHOT,
  envelopeAnomalies: [],
  anomalies: [],
};

const sortedText = (values: Iterable<string>) => [...values].sort(byText);

class Folder {
  readonly states: Map<string, ReviewState>;
  /** `sessionId/itemId` of the reviews applied in THIS run (see `advanceFold`). */
  readonly reviewed = new Set<string>();
  readonly reviewedSessions: Set<string>;
  readonly sessions: Set<string>;
  readonly completed: Set<string>;
  readonly results: Map<string, LessonResult>;
  readonly activeDates: Set<LocalDate>;
  readonly envelopeAnomalies: FoldAnomaly[];
  readonly anomalies: FoldAnomaly[];
  readonly rewards: RewardsLedger;
  xp: number;
  baselineStreak: Streak;
  placement: PlacementResult | null;
  cursor: FoldPosition | null;

  constructor(from: FoldSnapshot) {
    this.states = new Map(from.states.map((s) => [s.itemId, s]));
    this.reviewedSessions = new Set(from.reviewedSessionIds);
    this.sessions = new Set(from.completedSessionIds);
    this.completed = new Set(from.completedLessonIds);
    this.results = new Map(from.lessonResults.map((r) => [r.lessonId, r]));
    this.activeDates = new Set(from.activeDates);
    this.envelopeAnomalies = [...from.envelopeAnomalies];
    this.anomalies = [...from.anomalies];
    this.rewards = new RewardsLedger(from.rewards);
    this.xp = from.xp;
    this.baselineStreak = from.baselineStreak;
    this.placement = from.placement;
    this.cursor = from.cursor;
  }

  apply(event: ProgressEvent): void {
    switch (event.type) {
      case "item_reviewed": {
        const { sessionId, itemId, grade } = event.payload;
        const key = `${sessionId}/${itemId}`;
        if (this.reviewed.has(key)) return this.report("duplicate_item_review", event.id, key);
        this.reviewed.add(key);
        this.reviewedSessions.add(sessionId);
        const previous = this.states.get(itemId);
        this.states.set(itemId, applyReview(previous, itemId, grade, event.localDate));
        const wasDue =
          previous !== undefined && compareLocalDate(previous.dueDate, event.localDate) <= 0;
        if (wasDue && grade >= 3) this.rewards.onTimeReview(event.localDate);
        return;
      }
      case "session_completed": {
        const { sessionId, kind, lessonId, answerXp, accuracy } = event.payload;
        if (this.sessions.has(sessionId)) {
          return this.report("duplicate_session", event.id, sessionId);
        }
        this.sessions.add(sessionId);
        const date = event.localDate;
        if (!this.activeDates.has(date)) {
          this.activeDates.add(date);
          this.rewards.studyDay(date);
        }
        this.xp += answerXp;
        if (kind !== "lesson" || lessonId === undefined) {
          if (accuracy >= DAILY_REVIEW_MIN_ACCURACY) this.rewards.dailyReview(date);
          return;
        }
        const wasPerfect = this.results.get(lessonId)?.bestAccuracy === 1;
        this.recordResult(lessonId, accuracy);
        if (!this.completed.has(lessonId)) {
          this.completed.add(lessonId);
          this.xp += xpForLessonCompletion(accuracy);
          this.rewards.newLesson(date);
        }
        if (accuracy === 1 && !wasPerfect) this.rewards.perfectPage(date);
        return;
      }
      case "placement_completed":
        this.placement = { level: event.payload.level, theta: event.payload.theta };
        return;
      case "baseline_imported":
        return this.applyBaseline(event.payload, event.localDate);
      case "answer_disputed":
        // Content feedback only: the session's own events already carry the regraded answer.
        return;
      case "item_purchased":
        return this.rewards.purchase(event.payload.itemId, event.payload.price);
      case "item_equipped":
        return this.rewards.equip(event.payload.slot, event.payload.itemId);
    }
  }

  applyBaseline(payload: BaselineImportedEvent["payload"], date: LocalDate): void {
    for (const state of payload.states) {
      if (preferState(this.states.get(state.itemId), state)) this.states.set(state.itemId, state);
    }
    this.xp += payload.xp;
    this.baselineStreak = mergeStreaks(this.baselineStreak, payload.streak);
    if (payload.placement !== null) this.placement = payload.placement;
    let added = 0;
    for (const lessonId of payload.completedLessonIds ?? []) {
      if (this.completed.has(lessonId)) continue;
      this.completed.add(lessonId);
      added += 1;
    }
    // "Bienvenida": study done before the event log earns plumas once, like a first completion.
    this.rewards.welcome(date, added);
  }

  /** Best accuracy is a max and completions a count: both independent of the fold order. */
  recordResult(lessonId: string, accuracy: number): void {
    const current = this.results.get(lessonId);
    this.results.set(lessonId, {
      lessonId,
      bestAccuracy: Math.max(current?.bestAccuracy ?? 0, accuracy),
      completions: (current?.completions ?? 0) + 1,
    });
  }

  report(kind: FoldAnomalyKind, eventId: string, detail: string): void {
    this.anomalies.push({ kind, eventId, detail });
  }

  /**
   * Applies events already sorted in fold order, deduping by id as it goes. `reported` holds the
   * contents already reported (each corrupted copy is reported once).
   */
  foldSorted(sorted: readonly Keyed[], reported: Set<string>): void {
    const seen = new Map<string, string>();
    const last = sorted[sorted.length - 1];
    if (last !== undefined) this.cursor = positionOf(last);
    for (const { event, key } of sorted) {
      const first = seen.get(event.id);
      if (first !== undefined) {
        if (first !== key && !reported.has(key)) {
          reported.add(key);
          this.report("conflicting_duplicate", event.id, "");
        }
        continue;
      }
      seen.set(event.id, key);
      const parsed = parseEvent(event);
      if (parsed.ok) this.apply(parsed.event);
      else this.report(parsed.kind, event.id, parsed.detail);
    }
  }

  snapshot(): FoldSnapshot {
    return {
      v: FOLD_SNAPSHOT_VERSION,
      cursor: this.cursor,
      states: [...this.states.values()].sort((a, b) => byText(a.itemId, b.itemId)),
      xp: this.xp,
      baselineStreak: this.baselineStreak,
      placement: this.placement,
      activeDates: [...this.activeDates].sort(compareLocalDate),
      completedLessonIds: sortedText(this.completed),
      lessonResults: [...this.results.values()].sort((a, b) => byText(a.lessonId, b.lessonId)),
      completedSessionIds: sortedText(this.sessions),
      reviewedSessionIds: sortedText(this.reviewedSessions),
      rewards: this.rewards.snapshot(),
      envelopeAnomalies: this.envelopeAnomalies,
      anomalies: this.anomalies,
    };
  }
}

/**
 * Folds the whole log into a snapshot (see `foldEvents` for the rules), which `advanceFold` can
 * later extend with new events.
 */
export function foldSnapshot(events: readonly StoredEvent[]): FoldSnapshot {
  const folder = new Folder(EMPTY_FOLD_SNAPSHOT);
  const keyed: Keyed[] = [];
  const unordered: Keyed[] = [];
  for (const event of events) {
    const entry = { event, key: canonicalJson(event) };
    (validEnvelope(event) ? keyed : unordered).push(entry);
  }

  const reported = new Set<string>();
  for (const { event, key } of unordered.sort((a, b) => byText(a.key, b.key))) {
    if (reported.has(key)) continue;
    reported.add(key);
    folder.envelopeAnomalies.push({
      kind: "invalid_event",
      eventId: String(event.id),
      detail: "envelope",
    });
  }

  folder.foldSorted(keyed.sort(compareEvents), reported);
  return folder.snapshot();
}

/**
 * Extends `snapshot` (the fold of a log) with `events` added to that log, so that the result is
 * EXACTLY `foldSnapshot` of the whole new log, without reading or re-sorting the log: the cost
 * grows with `events` plus the snapshot's size (rebuilding its maps and sorted arrays: review
 * states, lesson results, session ids), not with the number of events folded. Precondition: no id of `events` is already in the folded log (a log keyed by id, like the
 * SQLite `event` table, passes only the events it actually added); ids may repeat within
 * `events`.
 *
 * Resolves to `null` — the caller then refolds the whole log — when the new events cannot simply
 * go after the ones folded:
 * - one sorts before the snapshot's cursor (an older date, another device's event);
 * - one cannot be ordered (unorderable events are reported first, sorted by content);
 * - one reviews an item in a session that already has folded reviews (telling a duplicate review
 *   apart would need every `sessionId/itemId` of the log).
 */
export function advanceFold(
  snapshot: FoldSnapshot,
  events: readonly StoredEvent[],
): FoldSnapshot | null {
  const keyed: Keyed[] = [];
  for (const event of events) {
    if (!validEnvelope(event)) return null;
    keyed.push({ event, key: canonicalJson(event) });
  }
  const first = keyed.sort(compareEvents)[0];
  if (first === undefined) return snapshot;
  if (snapshot.cursor !== null && comparePositions(positionOf(first), snapshot.cursor) <= 0) {
    return null;
  }
  const reviewedSessions = new Set(snapshot.reviewedSessionIds);
  const reviewsFoldedSession = keyed.some(({ event }) => {
    const parsed = parseEvent(event);
    return (
      parsed.ok &&
      parsed.event.type === "item_reviewed" &&
      reviewedSessions.has(parsed.event.payload.sessionId)
    );
  });
  if (reviewsFoldedSession) return null;

  const folder = new Folder(snapshot);
  folder.foldSorted(keyed, new Set());
  return folder.snapshot();
}

/** The learner's progress a snapshot stands for. */
export function snapshotProgress(snapshot: FoldSnapshot): ProgressState {
  return {
    states: snapshot.states,
    xp: snapshot.xp,
    streak: snapshot.activeDates.reduce(recordActivity, snapshot.baselineStreak),
    placement: snapshot.placement,
    activeDates: snapshot.activeDates,
    completedLessonIds: snapshot.completedLessonIds,
    lessonResults: snapshot.lessonResults,
    rewards: rewardsOf(snapshot.rewards),
    anomalies: [...snapshot.envelopeAnomalies, ...snapshot.anomalies],
  };
}

/**
 * Derives the learner's progress from an append-only event log. Pure and deterministic: the
 * result depends only on the SET of events, not on their input order or on duplicates, so devices
 * that exchange events converge without conflict resolution.
 *
 * 1. Events whose envelope cannot be ordered (bad id, date or timestamp) are reported and skipped.
 * 2. The rest are sorted by `(localDate, occurredAt, id)` (then canonical content) and deduped by
 *    id: identical copies fold once; different content under one id keeps the first and reports.
 * 3. Each event is applied at its position — baselines included — skipping unknown types or
 *    versions and malformed payloads (reported, never thrown).
 * 4. The streak replays `recordActivity` over the sorted unique dates of completed sessions,
 *    starting from the merged baseline streak.
 */
export function foldEvents(events: readonly StoredEvent[]): ProgressState {
  return snapshotProgress(foldSnapshot(events));
}
