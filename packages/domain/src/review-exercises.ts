import type { LocalDate } from "./local-date";
import { parseEvent, validEnvelope } from "./progress-log/validate";
import { canonicalJson } from "./progress-log/canonical";
import type { StoredEvent } from "./progress-log/events";

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Counts review exercises applied on `today`; older review events without a count use the cap. */
export function countDailyReviewExercises(
  events: readonly StoredEvent[],
  today: LocalDate,
  legacyReviewCount: number,
): number {
  const completions = events
    .filter(validEnvelope)
    .map((event) => ({ event, key: canonicalJson(event) }))
    .sort(
      (a, b) =>
        byText(a.event.localDate, b.event.localDate) ||
        a.event.occurredAt - b.event.occurredAt ||
        byText(a.event.id, b.event.id) ||
        byText(a.key, b.key),
    );
  const sessions = new Set<string>();
  let total = 0;
  for (const { event } of completions) {
    const parsed = parseEvent(event);
    if (!parsed.ok || parsed.event.type !== "session_completed") continue;
    const { sessionId, kind, exercises } = parsed.event.payload;
    if (sessions.has(sessionId)) continue;
    sessions.add(sessionId);
    if (kind === "review" && event.localDate === today) {
      total += exercises ?? legacyReviewCount;
    }
  }
  return total;
}
