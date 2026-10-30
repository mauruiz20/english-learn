export {
  DEFAULT_DIFFICULTY,
  difficultyOf,
  fisherInformation,
  guessingOf,
  levelFromTheta,
  probabilityCorrect,
} from "./model";
export type { PlacementAnswer, PlacementCandidate } from "./model";
export {
  THETA_MAX,
  THETA_MIN,
  THETA_STEP,
  TIE_EPSILON,
  estimateAbility,
  isBankExhausted,
  nextQuestion,
  shouldStop,
} from "./cat";
export type { AbilityEstimate, StopRule } from "./cat";
// `result` is exported as `placementResult` to keep the package-wide namespace unambiguous.
export {
  answer,
  createPlacementSession,
  currentQuestion,
  result as placementResult,
} from "./session";
export type { PlacementOutcome, PlacementSession, StopOptions } from "./session";
