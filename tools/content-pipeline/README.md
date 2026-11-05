# @english-learn/content-pipeline

Authoring-time tooling that helps pick real example sentences from
[Tatoeba](https://tatoeba.org) for `packages/content/data`. It never runs in the app and never
commits raw dumps: downloads go to the git-ignored `.cache/` directory.

## Commands

```
pnpm --filter @english-learn/content-pipeline download                 # fetch + decompress exports into .cache/
pnpm --filter @english-learn/content-pipeline candidates --level A2   # write .cache/candidates-a2.json
pnpm --filter @english-learn/content-pipeline verify                   # check every Tatoeba attribution in data/
pnpm --filter @english-learn/content-pipeline test                     # unit tests (fixtures only, no network)
```

`candidates` options: `--level A2|B1|B2` (default `A2`), `--limit N` per topic (default 60). Topic
keyword lists (the A2 topics, reused for B1, and the B2 topics) live in `src/topics.ts`.

## Sources

Weekly exports listed on <https://tatoeba.org/en/downloads> (updated every Saturday):

| File                                                                                    | Fields                                                   |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| <https://downloads.tatoeba.org/exports/per_language/eng/eng_sentences_detailed.tsv.bz2> | id, lang, text, username, date added, date last modified |
| <https://downloads.tatoeba.org/exports/per_language/spa/spa_sentences_detailed.tsv.bz2> | same                                                     |
| <https://downloads.tatoeba.org/exports/per_language/eng/eng-spa_links.tsv.bz2>          | sentence id, translation id (both directions are listed) |

The per-pair links file is not linked from the downloads page (which only lists the full
`links.tar.bz2`, about 150 MB), but it is published next to the per-language sentence files and has
the same format.

## License findings (checked 2026-10-29)

- The downloads page (<https://tatoeba.org/en/downloads>) states: "These files are released under
  CC BY 2.0 FR. A part of our sentences are also available under CC0 1.0." The CC0 subset is
  published separately (e.g. `eng_sentences_CC0.tsv.bz2`).
- License text: <https://creativecommons.org/licenses/by/2.0/fr/>. Attribution is required.
- The page also notes that many English and Japanese sentences come from the Tanaka Corpus, which
  is in the public domain.
- Policy here: every Tatoeba-derived exercise is recorded as
  `{ "kind": "tatoeba", "sentenceId", "author", "license": "CC BY 2.0 FR" }`. CC BY attribution is
  always valid, including for sentences that are also CC0, so the CC0 nuance is not tracked.
- `sentenceId` and `author` are those of the **English** sentence (the username from the detailed
  export). Sentences with no username (`\N`) are dropped because they cannot be attributed.
- Spanish text in exercises (options, `es` prompts and glosses) is written by us, not copied from
  the linked Spanish sentences, so only the English sentence needs attribution. `verify` checks
  that the English text in each exercise matches the attributed sentence exactly.

## Filters

`src/filter.ts` keeps a pair only when the English sentence has an author, is 3–14 words (A2),
6–20 words (B1) or 8–24 words (B2), contains no digits, no unusual characters, no likely proper names (non-initial
capitals other than `I`, days, months and a few allowed words; plus frequent Tatoeba first names such
as Tom and Mary), and no word from a small blocklist (violence, alcohol, insults, etc.). At least
one attributed, clean Spanish translation must remain. The shortlist is a starting point: an author
still checks every sentence by hand.
