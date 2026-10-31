export { levenshtein } from "./levenshtein";
export { canonicalCandidates, normalizeAnswer, MAX_CANDIDATES } from "./normalize";
export { matchAnswer, typoBudget } from "./match-answer";
export type { MatchResult, Verdict } from "./match-answer";
export {
  expandAccepted,
  expandPattern,
  isPattern,
  matchPatternAnswer,
  MAX_PATTERN_EXPANSIONS,
} from "./pattern";
export type { PatternExpansion } from "./pattern";
