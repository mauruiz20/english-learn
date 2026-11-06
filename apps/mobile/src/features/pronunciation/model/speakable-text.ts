/**
 * What to say for an item term or headword: the words a learner would say, without the
 * notation around them. Parenthesized and bracketed parts (`clean (something) up`,
 * `[informal]`) and a trailing `+ pattern` (`look forward to + -ing`) are left out, and
 * alternatives (`get on / get off`) are said one after the other. Empty when nothing is left.
 */
export function speakableTerm(term: string): string {
  return term
    .replace(/\([^)]*\)|\[[^\]]*\]/gu, " ")
    .replace(/\s\+.*$|^\+.*$/u, "")
    .split("/")
    .map((part) => part.replace(/\s+/gu, " ").trim())
    .filter((part) => part !== "")
    .join(", ");
}
