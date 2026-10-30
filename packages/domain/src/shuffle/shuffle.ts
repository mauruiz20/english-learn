/** Random source returning values in [0, 1), injected so results are reproducible. */
export type Rng = () => number;

function randomIndex(rng: Rng, exclusiveMax: number): number {
  // Clamp guards against rng implementations that can return exactly 1.
  return Math.min(exclusiveMax - 1, Math.floor(rng() * exclusiveMax));
}

/** Fisher–Yates shuffle. Returns a new array; the input is not modified. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomIndex(rng, i + 1);
    [result[i], result[j]] = [result[j] as T, result[i] as T];
  }
  return result;
}

export type Choices<T> = {
  readonly options: readonly T[];
  readonly answerIndex: number;
};

/** Shuffles multiple-choice options and remaps `answerIndex` to the correct option's new position. */
export function shuffleChoices<T>(
  { options, answerIndex }: Choices<T>,
  rng: Rng,
): { options: T[]; answerIndex: number } {
  if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= options.length) {
    throw new RangeError(
      `answerIndex ${answerIndex} is out of range for ${options.length} options`,
    );
  }
  const order = shuffle(
    options.map((_, i) => i),
    rng,
  );
  return {
    options: order.map((i) => options[i] as T),
    answerIndex: order.indexOf(answerIndex),
  };
}

const sameOrder = <T>(a: readonly T[], b: readonly T[]) => a.every((item, i) => item === b[i]);

const MAX_SHUFFLE_ATTEMPTS = 3;

/**
 * Shuffles tokens for word-order exercises, guaranteeing the result differs from the
 * input order whenever that is possible (≥ 2 tokens, not all equal). Tries a few
 * shuffles, then falls back to a left rotation by one, which always differs from the
 * original unless every token is equal.
 */
export function scrambleTokens<T>(tokens: readonly T[], rng: Rng): T[] {
  const scramblable = tokens.length >= 2 && tokens.some((t) => t !== tokens[0]);
  if (!scramblable) return [...tokens];

  for (let attempt = 0; attempt < MAX_SHUFFLE_ATTEMPTS; attempt++) {
    const result = shuffle(tokens, rng);
    if (!sameOrder(result, tokens)) return result;
  }
  return [...tokens.slice(1), ...tokens.slice(0, 1)];
}
