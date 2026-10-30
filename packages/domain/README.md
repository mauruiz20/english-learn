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
| `placement`       | Adaptive placement test (CAT) → CEFR level                          |
| `shuffle`         | Fisher–Yates shuffle, option shuffling, word-order token scrambling |
| `local-date`      | Branded `YYYY-MM-DD` date with pure calendar math (no timezones)    |
| `cefr`            | `Level` (`A1`…`C1`)                                                 |
| `glossary`        | Static word/phrase lookup: tokenizer, index, text annotation        |
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

## Glossary

Static English → Spanish lookup for hover (web) / tap (mobile). Entries come from
`@english-learn/content` (`data/glossary/`); this module only tokenizes and matches.

- `GlossaryEntry`: `{ id, headword, kind: "word" | "phrase", forms, senses: { es, pos? }[] }`.
  `forms` are lowercase surface forms (headword, inflections, contractions such as `won't`).
- `glossaryKey(text)`: lookup key — NFC, curly → straight apostrophes, lowercase.
- `tokenizeForGlossary(text, isForm?)`: `Token[]` (`{ kind: "word" | "other", text, start, end }`)
  alternating words and the text between them; the texts concatenate to the input exactly.
  - Apostrophes stay inside words (`won't`, `I'm`, `city's`). A trailing apostrophe is left out
    (a plural possessive `students'` looks like a closing quote `'the dishes'`), so both read as
    the bare word. Dotted abbreviations stay whole (`p.m.`).
  - Anything containing a digit (`2019`, `3rd`, `8:30`) and punctuation is `other`.
  - A hyphenated word stays whole only if `isForm(key)` knows it; otherwise it is split at hyphens.
- `buildGlossaryIndex(entries)`: maps forms to entry ids (first entry wins on a duplicate form; the
  content validator forbids duplicates).
- `lookupWord(index, word)`: case-insensitive. **Possessives**: if `x's` / `xs'` is not itself a
  listed form, it falls back to `x` / `xs` (`city's` → `city`, `students'` → `students`). A listed
  form always wins, so `it's` resolves to its own entry. (`annotateText` never sees `xs'`, since
  the tokenizer drops the trailing apostrophe.)
- `annotateText(text, index)`: `Segment[]` (`{ text, start, end, entryId, kind }`). Phrases first,
  longest form wins (`show me around` over `show me`), and phrase words must be separated by
  whitespace only (no match across punctuation or a cloze `___`); then single words. Uncovered
  words and other text have `entryId: null`. Segments rebuild the text exactly.

## Placement (CAT)

- **Model**: 3PL with discrimination fixed at 1 and fixed guessing
  `P(correct | θ) = c + (1 − c) / (1 + e^{−(θ − b)})`, `c = 1 / optionCount`.
- **Difficulty `b`** defaults from the item's CEFR level: A1 −2, A2 −1, B1 0, B2 1, C1 2.
- **Estimation**: EAP over a θ grid [−4, 4] (step 0.05) with a N(0, 1) prior, in log space.
  `se` is the posterior SD.
- **Item selection**: the unused item with maximum Fisher information at the current θ;
  near-ties (≤ 1e-6) are broken with the injected rng.
- **Stopping**: 20 questions, or ≥ 15 with `se < 0.4`, or when the bank runs out.
- **Level**: θ cutoffs −1.5 / −0.5 / 0.5 / 1.5 (a value on a cutoff goes to the upper level).
- **API**: `createPlacementSession` → `currentQuestion` → `answer(session, id, correct, rng)` →
  `placementResult`. Sessions are plain immutable data (serializable); the rng is passed per call.

> **Caveat**: item difficulties are CEFR-derived _priors_, not calibrated parameters. Results are a
> reasonable starting level, not a certified score. Calibration (fitting `b` per item from real
> responses) is planned once the phase-2 backend collects data.

## Scripts

```sh
pnpm --filter @english-learn/domain test
pnpm --filter @english-learn/domain typecheck
```
