# @english-learn/domain

Pure TypeScript domain logic for the app. Zero runtime dependencies, no I/O, deterministic:
time and randomness are always injected (`LocalDate` values, `Clock` port, `rng: () => number`).
It does not import `@english-learn/content`; the app layer maps content into these input types.

## Modules

| Folder            | Responsibility                                                      |
| ----------------- | ------------------------------------------------------------------- |
| `answer-matching` | Grades free-text answers: `correct` / `almost` / `wrong`            |
| `srs`             | SM-2 scheduling, outcome → grade mapping, session selection         |
| `scoring`         | XP per answer, lesson completion bonus, accuracy                    |
| `streak`          | Daily streak (current / longest)                                    |
| `progress`        | Per-level seen / mastered counts                                    |
| `shuffle`         | Fisher–Yates shuffle, option shuffling, word-order token scrambling |
| `local-date`      | Branded `YYYY-MM-DD` date with pure calendar math (no timezones)    |
| `cefr`            | `Level` (`A1`…`C1`)                                                 |
| `ports`           | Side-effect interfaces: `Clock`, `ProgressRepository` (types only)  |

Everything is re-exported from `src/index.ts`.

## Answer matching

Both the input and every accepted answer go through the same pipeline:

1. **Normalize**: Unicode NFC, curly quotes/apostrophes → straight, lowercase, collapse whitespace,
   remove spaces before punctuation, strip leading/trailing punctuation and quotes (so a final
   `.`, `!` or `?` is ignored).
2. **Expand contractions** to a canonical form: `won't` → `will not`, `can't`/`cannot` → `can not`,
   `n't` → ` not`, `'m` → ` am`, `'re` → ` are`, `'ve` → ` have`, `'ll` → ` will`.
   Ambiguous `'s` (is / has / possessive) and `'d` (would / had) produce several candidates;
   the answer is **correct** if any input candidate equals any accepted candidate.
   Candidates are capped at 16 per answer (further ambiguous contractions keep their first reading).
3. **Typo tolerance** (Levenshtein on canonical forms). The answer is **almost** when:
   - the input is not empty, and
   - the distance is > 0 and ≤ 1 (accepted length ≤ 10), ≤ 2 (≤ 25) or ≤ 3 (longer), and
   - it is a typo inside one word: same word count, exactly one word differs, and that word
     needs fewer edits than half its length. This keeps grammar mistakes such as
     `in` → `on`, `a` → `an`, or a missing/extra word as **wrong**.

`closest` is the original text of the accepted answer with the smallest distance.

## SRS (SM-2)

- `review(state, grade, today)`: grade < 3 is a lapse (reps = 0, interval = 1 day, lapses + 1);
  otherwise the interval goes 1 → 6 → `round(interval × ease)` using the ease from before the review.
- Ease is updated on **every** grade (as in the original SM-2) with
  `ease + (0.1 − (5−g)(0.08 + (5−g)·0.02))`, floored at 1.3.
- Grade mapping (`gradeFromOutcome`):

  | Outcome                            | Grade |
  | ---------------------------------- | ----- |
  | wrong                              | 1     |
  | almost                             | 3     |
  | correct, `responseMs > expectedMs` | 4     |
  | correct, on time                   | 5     |

- `selectSession`: due items (`dueDate ≤ today`) by dueDate asc, lapses desc, itemId; then unseen new items.

## Scripts

```sh
pnpm --filter @english-learn/domain test
pnpm --filter @english-learn/domain typecheck
```
