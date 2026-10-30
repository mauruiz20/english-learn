/** A run of the learner's answer, marked when it differs from the expected answer. */
export type AnswerSegment = { readonly text: string; readonly differs: boolean };

const normalize = (word: string) => word.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "");

/**
 * Splits `given` into runs of words that also appear, in order, in `expected` (longest common
 * subsequence of words, ignoring case and punctuation) and runs that do not. Used to strike
 * through only what is off in an "almost" answer. Words keep their original spelling and the
 * runs join back into `given` with single spaces.
 */
export function diffWords(given: string, expected: string): AnswerSegment[] {
  const a = given.trim().split(/\s+/).filter(Boolean);
  const b = expected.trim().split(/\s+/).filter(Boolean).map(normalize);
  const na = a.map(normalize);
  // lcs[i][j]: LCS length of na[i..] and b[j..].
  const lcs = Array.from({ length: na.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = na.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      const row = lcs[i]!;
      row[j] = na[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, row[j + 1]!);
    }
  }
  const matched = new Array<boolean>(a.length).fill(false);
  for (let i = 0, j = 0; i < na.length && j < b.length;) {
    if (na[i] === b[j]) {
      matched[i] = true;
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) i++;
    else j++;
  }
  const segments: AnswerSegment[] = [];
  a.forEach((word, i) => {
    const differs = !matched[i];
    const last = segments[segments.length - 1];
    if (last !== undefined && last.differs === differs) {
      segments[segments.length - 1] = { text: `${last.text} ${word}`, differs };
    } else {
      segments.push({ text: word, differs });
    }
  });
  return segments;
}
