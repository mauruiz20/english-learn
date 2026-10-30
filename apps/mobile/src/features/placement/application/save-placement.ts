import type {
  LocalDate,
  PlacementOutcome,
  PlacementResult,
  ProgressRepository,
} from "@english-learn/domain";
import { placementCompletedEvent, type RandomBytes } from "@/features/progress/progress-events";

export type SavePlacementInput = {
  readonly repository: ProgressRepository;
  readonly outcome: Pick<PlacementOutcome, "level" | "theta">;
  readonly today: LocalDate;
  readonly nowMs: number;
  readonly randomBytes: RandomBytes;
  readonly deviceId: string;
};

/** Appends a `placement_completed` event; the latest one is the learner's placement. */
export async function savePlacement({
  repository,
  outcome,
  today,
  nowMs,
  randomBytes,
  deviceId,
}: SavePlacementInput): Promise<PlacementResult> {
  const stamp = { deviceId, occurredAt: nowMs, localDate: today, randomBytes };
  await repository.appendEvents([placementCompletedEvent(stamp, outcome.level, outcome.theta)]);
  return { level: outcome.level, theta: outcome.theta };
}
