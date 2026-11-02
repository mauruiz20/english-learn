export { levenshtein } from "./levenshtein";
export { canonicalCandidates, normalizeAnswer, MAX_CANDIDATES } from "./normalize";
export { calqueHint } from "./calque-hints";
export { FUNCTION_WORDS, matchAnswer, typoBudget } from "./match-answer";
export type { MatchResult, Verdict } from "./match-answer";
export {
  expandAccepted,
  expandPattern,
  isPattern,
  matchPatternAnswer,
  MAX_PATTERN_EXPANSIONS,
} from "./pattern";
export type { PatternExpansion } from "./pattern";
export { diffAnswer } from "./word-diff";
export type { WordDiffOp } from "./word-diff";
