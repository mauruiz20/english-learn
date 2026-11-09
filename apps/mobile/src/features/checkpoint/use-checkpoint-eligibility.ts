import {
  CHECKPOINT_DELAY_MS,
  checkpointAvailable,
  type CheckpointEvidence,
} from "@english-learn/domain";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { CHECKPOINT_ID, SOURCE_LESSON_ID } from "./checkpoint-config";
import { useAppServices } from "@/infrastructure/services/app-services";

export type CheckpointEligibility =
  | { readonly status: "loading" }
  | { readonly status: "error" }
  | { readonly status: "missing" }
  | { readonly status: "waiting" }
  | { readonly status: "ready" }
  | { readonly status: "completed"; readonly evidence: CheckpointEvidence };

/** Reads persisted eligibility and rechecks waiting evidence when the exact delay expires. */
export function useCheckpointEligibility() {
  const { progressRepository, clock } = useAppServices();
  const [eligibility, setEligibility] = useState<CheckpointEligibility>({ status: "loading" });
  const [refresh, setRefresh] = useState(0);

  useFocusEffect(
    useCallback(() => {
      void refresh;
      let active = true;
      let boundaryTimer: ReturnType<typeof setTimeout> | undefined;
      setEligibility({ status: "loading" });
      progressRepository.getCheckpointEvidence(CHECKPOINT_ID, SOURCE_LESSON_ID).then(
        (evidence) => {
          if (!active) return;
          if (evidence.completedAt === null) {
            setEligibility({ status: "missing" });
          } else if (evidence.result !== null) {
            setEligibility({ status: "completed", evidence });
          } else {
            const now = clock.nowMs();
            if (checkpointAvailable(evidence, now)) setEligibility({ status: "ready" });
            else {
              setEligibility({ status: "waiting" });
              const remaining = evidence.completedAt + CHECKPOINT_DELAY_MS - now;
              if (remaining > 0) {
                boundaryTimer = setTimeout(() => {
                  if (active) setRefresh((version) => version + 1);
                }, remaining + 1);
              }
            }
          }
        },
        () => active && setEligibility({ status: "error" }),
      );
      return () => {
        active = false;
        if (boundaryTimer !== undefined) clearTimeout(boundaryTimer);
      };
    }, [clock, progressRepository, refresh]),
  );

  return {
    eligibility,
    retryEligibility: () => setRefresh((version) => version + 1),
  };
}
