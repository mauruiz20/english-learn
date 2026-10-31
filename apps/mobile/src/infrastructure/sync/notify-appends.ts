import type { ProgressRepository } from "@english-learn/domain";

/**
 * `repository` that calls `onAppended` once an append committed (a completed session or a
 * placement result), so a signed-in learner's progress syncs right away.
 */
export function notifyAppends(
  repository: ProgressRepository,
  onAppended: () => void,
): ProgressRepository {
  return {
    ...repository,
    appendEvents: async (events) => {
      const result = await repository.appendEvents(events);
      onAppended();
      return result;
    },
  };
}
