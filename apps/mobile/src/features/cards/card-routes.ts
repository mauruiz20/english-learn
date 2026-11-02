/** The study card's screen. `fromSession`: opened on top of a session ("Ver ficha"). */
export function cardPath(cardId: string, { fromSession = false } = {}): string {
  const path = `/fichas/${encodeURIComponent(cardId)}`;
  return fromSession ? `${path}?volver=1` : path;
}

/** The practice of a study card's exercises. */
export function cardPracticePath(cardId: string): string {
  return `/fichas/${encodeURIComponent(cardId)}/practicar`;
}
