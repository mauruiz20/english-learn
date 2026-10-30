import type { PreparedExercise } from "../model/prepare-exercise";
import type { ExerciseResponse } from "../model/response";

/** Props every exercise component receives. `disabled` locks it while feedback is shown. */
export type ExerciseProps<T extends PreparedExercise["type"]> = {
  prepared: Extract<PreparedExercise, { type: T }>;
  disabled: boolean;
  /** Feedback is shown: mark the options (right answer, the learner's mistake). */
  reveal?: boolean | undefined;
  onSubmit: (response: ExerciseResponse) => void;
  /** Submit button label (default "Comprobar"); e.g. "Siguiente" when no feedback follows. */
  submitLabel?: string | undefined;
};
