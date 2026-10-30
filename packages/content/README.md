# @english-learn/content

Static, validated learning content. No AI at runtime: everything is JSON under `data/`, checked by
Zod schemas plus corpus-wide semantic rules. CI fails on malformed content (`pnpm validate:content`).

## Layout

```
src/schema/    Zod schemas and inferred types (Level, Source, Item, Exercise, Passage, Lesson, PlacementQuestion, ContentFile)
src/validate/  Pure semantic rules; each returns { file, path, message }[] and never throws
scripts/       validate.ts CLI: main(dir) => errors
data/          placement/, a2/, b1/ ... many small ContentFile JSON files (never one giant file)
```

## IDs are immutable

Ids look like `<level>.<topic>.<slug>` (e.g. `b1.travel.although`, `b1.travel.cloze-001`);
placement questions use `placement.<level>.<slug>`. **Once published, an id must never change or be
reused**: learner progress references items and exercises by id. To retire content, remove it from
lessons but keep the id reserved; to change meaning, add a new id.

## Semantic rules

1. Ids are unique per entity kind across the whole corpus.
2. References resolve: `exercise.itemIds` -> items, `reading.passageId` -> passages, `lesson.exerciseIds` -> exercises.
3. `answerIndex` is within `options` (vocab, translation_choice, reading questions, placement).
4. Options have no duplicates (case-insensitive, trimmed).
5. Cloze: exactly one `___`; no answer appears in `distractors`.
6. Word order: see the convention below.
7. Levels: an exercise has its lesson's level; files under `data/<level>/` contain only that level
   (`data/placement` is exempt); an id's level prefix matches its `level`.

### Word-order convention

Tokens are written exactly as they appear in the sentence, punctuation attached to its word
(`"rained."`). Splitting an accepted sentence on whitespace must give the same multiset of tokens, so
the tokens joined by single spaces in the right order rebuild the accepted sentence exactly. At least
one accepted sentence must satisfy this; by convention it is the first (canonical) one.

### Placement questions

A placement question carries its own `id` and `level`, so its embedded exercise (vocab, cloze or
translation_choice) omits `id`, `itemIds` and `level` but keeps `source`.

## Attribution

Original content uses `source: { "kind": "original" }`. Sentences from
[Tatoeba](https://tatoeba.org) are licensed CC BY 2.0 FR and must be recorded as
`{ "kind": "tatoeba", "sentenceId", "author", "license": "CC BY 2.0 FR" }`; the app must display
this attribution.

## Commands

```
pnpm --filter @english-learn/content test       # unit + integration tests
pnpm validate:content                           # validate data/ (exit 1 on errors)
```
