import { LEVELS } from "../cefr";
import { isValidLocalDate } from "../local-date";
import type { PlacementResult } from "../ports";
import type { ReviewState } from "../srs";
import type { Streak } from "../streak";
import { EVENT_PAYLOAD_VERSION, type ProgressEvent, type StoredEvent } from "./events";

/** Result of reading a stored event: a typed event, or why it must be skipped. */
export type Parsed =
  | { readonly ok: true; readonly event: ProgressEvent }
  | {
      readonly ok: false;
      readonly kind: "unsupported_event" | "invalid_event";
      readonly detail: string;
    };

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isNonNegInt = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;
const isFiniteNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isDate = (v: unknown): boolean => typeof v === "string" && isValidLocalDate(v);

/** Envelope fields needed to order an event at all. */
export function validEnvelope(e: StoredEvent): boolean {
  return (
    isText(e.id) &&
    typeof e.deviceId === "string" &&
    isFiniteNum(e.occurredAt) &&
    isDate(e.localDate) &&
    typeof e.type === "string"
  );
}

function isReviewState(v: unknown): v is ReviewState {
  return (
    isObj(v) &&
    isText(v.itemId) &&
    isFiniteNum(v.ease) &&
    isNonNegInt(v.intervalDays) &&
    isNonNegInt(v.reps) &&
    isNonNegInt(v.lapses) &&
    isDate(v.dueDate)
  );
}

function isStreak(v: unknown): v is Streak {
  return (
    isObj(v) &&
    isNonNegInt(v.current) &&
    isNonNegInt(v.longest) &&
    v.longest >= v.current &&
    (v.lastActiveDate === null || isDate(v.lastActiveDate))
  );
}

function isPlacement(v: unknown): v is PlacementResult {
  return isObj(v) && LEVELS.includes(v.level as never) && isFiniteNum(v.theta);
}

const VALIDATORS: Readonly<Record<ProgressEvent["type"], (p: Obj) => boolean>> = {
  item_reviewed: (p) =>
    isText(p.sessionId) &&
    isText(p.itemId) &&
    Number.isInteger(p.grade) &&
    (p.grade as number) >= 0 &&
    (p.grade as number) <= 5,
  session_completed: (p) =>
    isText(p.sessionId) &&
    (p.kind === "review" || (p.kind === "lesson" && isText(p.lessonId))) &&
    isNonNegInt(p.answerXp) &&
    isFiniteNum(p.accuracy) &&
    p.accuracy >= 0 &&
    p.accuracy <= 1,
  placement_completed: (p) => isPlacement(p),
  baseline_imported: (p) =>
    Array.isArray(p.states) &&
    p.states.every(isReviewState) &&
    isNonNegInt(p.xp) &&
    isStreak(p.streak) &&
    (p.placement === null || isPlacement(p.placement)) &&
    (p.completedLessonIds === undefined ||
      (Array.isArray(p.completedLessonIds) && p.completedLessonIds.every(isText))),
};

const isKnownType = (t: string): t is ProgressEvent["type"] => Object.hasOwn(VALIDATORS, t);

/**
 * Checks a stored event (whose envelope is already valid) against the known schemas.
 * Unknown `type` or payload `v` → `unsupported_event` (written by a newer app);
 * a known type and version with bad fields → `invalid_event`.
 */
export function parseEvent(e: StoredEvent): Parsed {
  if (!isKnownType(e.type)) return { ok: false, kind: "unsupported_event", detail: e.type };
  if (!isObj(e.payload)) return { ok: false, kind: "invalid_event", detail: `${e.type} payload` };
  if (e.payload.v !== EVENT_PAYLOAD_VERSION) {
    return { ok: false, kind: "unsupported_event", detail: `${e.type} v${String(e.payload.v)}` };
  }
  if (!VALIDATORS[e.type](e.payload)) {
    return { ok: false, kind: "invalid_event", detail: `${e.type} payload` };
  }
  return { ok: true, event: e as ProgressEvent };
}
