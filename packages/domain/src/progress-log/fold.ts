import { compareLocalDate, type LocalDate } from "../local-date";
import type { PlacementResult } from "../ports";
import { xpForLessonCompletion } from "../scoring";
import { applyReview, type ReviewState } from "../srs";
import { EMPTY_STREAK, recordActivity, type Streak } from "../streak";
import { canonicalJson } from "./canonical";
import type { BaselineImportedEvent, ProgressEvent, StoredEvent } from "./events";
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
  anomalies: [],
};

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

type Keyed = { readonly event: StoredEvent; readonly key: string };

/** Total order `(localDate, occurredAt, id)`, then canonical content so the sort is total. */
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

class Folder {
  readonly states = new Map<string, ReviewState>();
  readonly reviewed = new Set<string>();
  readonly sessions = new Set<string>();
  readonly completed = new Set<string>();
  readonly activeDates = new Set<LocalDate>();
  readonly anomalies: FoldAnomaly[] = [];
  xp = 0;
  baselineStreak: Streak = EMPTY_STREAK;
  placement: PlacementResult | null = null;

  apply(event: ProgressEvent): void {
    switch (event.type) {
      case "item_reviewed": {
        const { sessionId, itemId, grade } = event.payload;
        const key = `${sessionId}/${itemId}`;
        if (this.reviewed.has(key)) return this.report("duplicate_item_review", event.id, key);
        this.reviewed.add(key);
        this.states.set(
          itemId,
          applyReview(this.states.get(itemId), itemId, grade, event.localDate),
        );
        return;
      }
      case "session_completed": {
        const { sessionId, kind, lessonId, answerXp, accuracy } = event.payload;
        if (this.sessions.has(sessionId)) {
          return this.report("duplicate_session", event.id, sessionId);
        }
        this.sessions.add(sessionId);
        this.activeDates.add(event.localDate);
        this.xp += answerXp;
        if (kind === "lesson" && lessonId !== undefined && !this.completed.has(lessonId)) {
          this.completed.add(lessonId);
          this.xp += xpForLessonCompletion(accuracy);
        }
        return;
      }
      case "placement_completed":
        this.placement = { level: event.payload.level, theta: event.payload.theta };
        return;
      case "baseline_imported":
        return this.applyBaseline(event.payload);
    }
  }

  applyBaseline(payload: BaselineImportedEvent["payload"]): void {
    for (const state of payload.states) {
      if (preferState(this.states.get(state.itemId), state)) this.states.set(state.itemId, state);
    }
    this.xp += payload.xp;
    this.baselineStreak = mergeStreaks(this.baselineStreak, payload.streak);
    if (payload.placement !== null) this.placement = payload.placement;
    for (const lessonId of payload.completedLessonIds ?? []) this.completed.add(lessonId);
  }

  report(kind: FoldAnomalyKind, eventId: string, detail: string): void {
    this.anomalies.push({ kind, eventId, detail });
  }

  result(): ProgressState {
    const activeDates = [...this.activeDates].sort(compareLocalDate);
    return {
      states: [...this.states.values()].sort((a, b) => byText(a.itemId, b.itemId)),
      xp: this.xp,
      streak: activeDates.reduce(recordActivity, this.baselineStreak),
      placement: this.placement,
      activeDates,
      completedLessonIds: [...this.completed].sort(byText),
      anomalies: this.anomalies,
    };
  }
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
  const folder = new Folder();
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
    folder.report("invalid_event", String(event.id), "envelope");
  }

  const seen = new Map<string, string>();
  for (const { event, key } of keyed.sort(compareEvents)) {
    const first = seen.get(event.id);
    if (first !== undefined) {
      if (first !== key && !reported.has(key)) {
        reported.add(key);
        folder.report("conflicting_duplicate", event.id, "");
      }
      continue;
    }
    seen.set(event.id, key);
    const parsed = parseEvent(event);
    if (parsed.ok) folder.apply(parsed.event);
    else folder.report(parsed.kind, event.id, parsed.detail);
  }
  return folder.result();
}
