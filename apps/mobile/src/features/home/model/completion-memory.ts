/**
 * The lessons that became done since the last time the index was seen. `seen` is null on the
 * first look of the session: nothing is new then (the learner did not just finish those), so
 * nothing is celebrated.
 */
export function newlyCompleted(
  seen: ReadonlySet<string> | null,
  done: readonly string[],
): ReadonlySet<string> {
  if (seen === null) return new Set();
  return new Set(done.filter((id) => !seen.has(id)));
}

export type CompletionMemory = {
  /** The lessons new since the last call, remembering `done` as seen. */
  take(done: readonly string[]): ReadonlySet<string>;
};

/**
 * Remembers, in memory, which lessons the home index last showed as done, so a check mark is
 * drawn once, when the learner comes back from completing the lesson, and never replayed.
 */
export function createCompletionMemory(): CompletionMemory {
  let seen: ReadonlySet<string> | null = null;
  return {
    take(done) {
      const fresh = newlyCompleted(seen, done);
      seen = new Set(done);
      return fresh;
    },
  };
}

/** The app session's memory (lost on reload: a fresh session celebrates nothing). */
export const sessionCompletionMemory = createCompletionMemory();
