/** A path stop as far as its "Profundiza" steps go. */
export type DeepenStop = {
  readonly id: string;
  readonly done: boolean;
  readonly deepenCardIds?: readonly string[] | undefined;
};

/**
 * The "Profundiza" cards under each stop, by lesson id: a done lesson's linked cards, each card
 * once on the whole path, under the earliest done lesson (in path order) that links it. Content
 * links a card to one lesson per topic (rule 22); this keeps the path free of repeats even when
 * lessons of different topics link the same card. Lessons with nothing to show are left out.
 */
export function deepenSteps(stops: readonly DeepenStop[]): Map<string, readonly string[]> {
  const shown = new Set<string>();
  const steps = new Map<string, readonly string[]>();
  for (const stop of stops) {
    if (!stop.done) continue;
    const cards = (stop.deepenCardIds ?? []).filter((id) => !shown.has(id));
    if (cards.length === 0) continue;
    cards.forEach((id) => shown.add(id));
    steps.set(stop.id, cards);
  }
  return steps;
}
