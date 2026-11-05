# English Learn

An offline-first English course for Spanish speakers, for **web and Android from one TypeScript
codebase**. No accounts, no network and no AI at runtime: content is static, validated in CI and
bundled with the app.

[![CI](https://github.com/mauruiz20/english-learn/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/mauruiz20/english-learn/actions/workflows/ci.yml)

**Live demo:** <https://english.maumar.com.ar> (deployed from `main` to Cloudflare Pages after
every check passes; installable and usable offline; progress is stored in your browser only).

| At a glance  |                                                                                   |
| ------------ | --------------------------------------------------------------------------------- |
| Stack        | Expo SDK 58 · React Native 0.88 · React 19 · TypeScript · expo-router · SQLite    |
| Architecture | pnpm monorepo · hexagonal (ports & adapters) · screaming architecture             |
| Quality      | TDD · 592 unit/integration tests · 12 Playwright e2e specs on Chromium + WebKit   |
| Delivery     | GitFlow · Conventional Commits · GitHub Actions (format, lint, types, tests, e2e) |
| Version      | 0.2.0, see [CHANGELOG](CHANGELOG.md)                                              |

## Contents

- [Features](#features-mvp)
- [Architecture](#architecture)
- [Key engineering decisions](#key-engineering-decisions)
- [Testing](#testing)
- [Optional backend](#optional-backend)
- [Content and licensing](#content-and-licensing)
- [Getting started](#getting-started)
- [Roadmap](#roadmap)
- [License](#license)

## Features (MVP)

- **Adaptive placement test**: up to 20 questions, chosen one by one for maximum information,
  that suggest a starting CEFR level (A1 to C1).
- **Lessons with 6 written exercise types**: vocabulary, cloze, word order, translation choice,
  reading comprehension and free-text translation. Free text is graded with typo and
  contraction tolerance (`correct` / `almost` / `wrong`).
- **Spaced repetition (SM-2)**: a daily review of due items, scheduled per item. A lesson's new
  items are due the next day and come first in that review.
- **"Lo nuevo de hoy"**: every lesson ends with the 3–5 items it introduces, linked to their study
  card or explained with their meaning and an example; the path shows each lesson's best result
  (perfect or "5/6"), and any lesson can be redone to get everything right. A done lesson also
  offers the study cards that go deeper into it ("Profundiza"), with their best result.
- **Progress as a game**: XP in sheets of stickers, a daily streak as a paperclip chain, the
  level's lessons as a path of stickers, and an album of nineteen achievements, all derived from
  the stored progress.
- **A path through the levels**: home starts at the placement level and moves on to the next
  level once every lesson of the current one is done (A2 → B1 → B2).
- **Fully offline**: progress lives in SQLite on the device (WebAssembly + OPFS on web).
- **Content**: A2, B1 and B2 courses, plus a placement bank covering A1 to C1. Every B2 study
  card is linked from the B2 lesson that teaches it.

| Content                | A2  | B1  | B2  | Total |
| ---------------------- | --- | --- | --- | ----- |
| Topics                 | 10  | 11  | 8   | 29    |
| Lessons                | 20  | 22  | 16  | 58    |
| Exercises              | 143 | 159 | 119 | 421   |
| Items (words, phrases) | 115 | 133 | 64  | 312   |
| Reading passages       | 10  | 12  | 8   | 30    |

B2 lessons also practice the items of the B2 study cards they link (19 more).

Placement bank: 65 questions, 13 per level from A1 to C1.

## Architecture

```mermaid
graph TD
  mobile["apps/mobile<br/>Expo app: screens, adapters, DI"]
  domain["packages/domain<br/>pure logic + ports"]
  storage["packages/storage-sqlite<br/>ProgressRepository adapter"]
  content["packages/content<br/>validated JSON + generated corpus"]
  pipeline["tools/content-pipeline<br/>Tatoeba authoring tools"]

  mobile --> domain
  mobile --> storage
  mobile --> content
  storage --> domain
  pipeline -. "reads / verifies data/" .-> content
```

| Package                                                        | Role                                                                                     |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [`packages/domain`](packages/domain/README.md)                 | SRS, answer matching, scoring, streak, placement (CAT). Zero dependencies, no I/O.       |
| [`packages/content`](packages/content/README.md)               | JSON lessons and exercises, Zod schemas, semantic validation, generated corpus.          |
| [`packages/storage-sqlite`](packages/storage-sqlite/README.md) | SQLite implementation of the domain's `ProgressRepository` port, with migrations.        |
| [`apps/mobile`](apps/mobile/README.md)                         | Expo app (Android + web): routes, feature screens, infrastructure wiring.                |
| [`tools/content-pipeline`](tools/content-pipeline/README.md)   | Authoring-time CLI: shortlists Tatoeba sentences and verifies attributions. Never ships. |
| [`services/api`](services/api/README.md)                       | Optional Python API (FastAPI, PostgreSQL): Google sign-in now, progress sync next.       |

**Hexagonal.** The domain owns the ports (`Clock`, `ProgressRepository`) and never touches I/O;
time and randomness are always injected. `storage-sqlite` and the app's `infrastructure/` are the
adapters, wired through a React context (`AppServicesProvider`), so tests swap in in-memory fakes
and a deterministic random source.

**Screaming architecture.** Folders are named after what the app does, not the framework:
`domain/src/{srs,placement,scoring,streak,answer-matching}` and
`mobile/src/features/{home,lesson,review,placement,about}`. Expo-router's `src/app/` only holds
thin route files.

**Container / presentational.** Each feature screen has a container that loads data and
dispatches, and a view that only renders props. Feature logic (grading, the session reducer,
SM-2 updates) lives in pure `model/` modules with their own unit tests.

## Key engineering decisions

| Decision                                  | Why                                                                                                                                                                                                                            |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Static, validated content with a CI gate  | No AI or server at runtime. Zod schemas plus 12 corpus-wide semantic rules (references, levels, cloze shape, word-order solvability) fail CI on malformed content.                                                             |
| Generated corpus module                   | `build:corpus` emits a committed TypeScript module of static JSON imports. The app imports `@english-learn/content/corpus`, so Zod stays out of the bundle; CI fails if the generated file is stale.                           |
| Pure, dependency-free domain              | Deterministic logic (injected clock and rng) is fast to test and portable to a future backend.                                                                                                                                 |
| SM-2 grade from correctness + latency     | Learners never self-rate. Wrong → 1, almost → 3, correct but slower than the type's expected time → 4, correct on time → 5.                                                                                                    |
| Replay counts as practice                 | Replaying a lesson before its items are due leaves passing items unchanged (no inflated intervals); a wrong answer still counts as a lapse.                                                                                    |
| 3PL CAT with EAP estimation               | Fixed guessing `c = 1/options` fits multiple choice; EAP over a θ grid is stable with few answers. **Caveat:** difficulties are CEFR-derived priors, not calibrated, so the result is a starting level, not a certified score. |
| Atomic session save                       | Finishing a lesson writes review states, XP and streak in one SQLite transaction: all or nothing, so a failed save can simply be retried.                                                                                      |
| expo-sqlite on web via WASM + OPFS        | One storage adapter for Android and web. It needs `SharedArrayBuffer`, so the host must send COOP `same-origin` and COEP `require-corp` (`credentialless` is not supported by Safari).                                         |
| E2E clock override kept out of production | E2E tests jump days with `?today=`; the code only exists when built with `EXPO_PUBLIC_E2E=1`, and a CI script fails if it appears in the production bundle.                                                                    |

Package READMEs hold the details (algorithms, rules, error handling).

## Testing

Written test-first (TDD). Numbers from `pnpm test` and `playwright test --list` at v0.1.0:

| Package                   | Runner                                 | Tests                                     |
| ------------------------- | -------------------------------------- | ----------------------------------------- |
| `packages/domain`         | Vitest                                 | 231                                       |
| `packages/content`        | Vitest                                 | 123                                       |
| `packages/storage-sqlite` | Vitest (real SQLite via `node:sqlite`) | 25                                        |
| `tools/content-pipeline`  | Vitest (fixtures, no network)          | 20                                        |
| `apps/mobile`             | Jest + React Native Testing Library    | 193                                       |
| `apps/mobile` e2e         | Playwright on Chromium + WebKit        | 12 specs (24 runs) against the web export |

CI (`.github/workflows/ci.yml`) runs on pushes and pull requests to `main` and `develop`:
format, lint, typecheck, unit tests, content validation, corpus freshness, production web export
(with the bundle check) and the Playwright suite.

## Optional backend

[`services/api`](services/api/README.md) is a FastAPI + PostgreSQL service (Python 3.14, uv,
SQLAlchemy async, Alembic) with the same hexagonal and screaming layout. It adds optional Google
sign-in for the web app: Google ID token in, a 15-minute JWT access token and a rotating refresh
token (reuse detection revokes the whole family) out. Progress sync will exchange the domain's
event log; the server stores events opaquely and never folds them. Its CI job runs Ruff, strict
mypy and pytest against a real PostgreSQL 18 (testcontainers).

It is deployed with Docker Compose to a Raspberry Pi 5 behind a Cloudflare Tunnel, with nightly
backups and a monthly restore drill: see [docs/deploy.md](docs/deploy.md).

## Content and licensing

- **Original content** is written for this project. No copyrighted word lists or textbook
  material are copied.
- **Tatoeba sentences** (138 of 421 lesson exercises) are used under
  [CC BY 2.0 FR](https://creativecommons.org/licenses/by/2.0/fr/). Each one records the sentence
  id and author in its `source` field, a pipeline check verifies the English text matches the
  attributed sentence exactly, and the app's About screen credits Tatoeba with the license.
  Spanish translations are our own.
- **Conventions**: American English spelling; neutral Spanish for UI and prompts (no voseo).

## Getting started

**Prerequisites:** Node.js 24 (see `.nvmrc`) and pnpm through Corepack.

```sh
corepack enable
pnpm install

# Run the app
pnpm --filter @english-learn/mobile web       # web dev server
pnpm --filter @english-learn/mobile android   # Android emulator or device (Expo)

# Checks (the same as CI's check job)
pnpm check                 # format, lint, typecheck, tests, content validation, corpus check
pnpm test                  # unit and integration tests only
pnpm validate:content      # validate packages/content/data

# Web build and e2e
pnpm --filter @english-learn/mobile export:web   # production export to apps/mobile/dist
pnpm --filter @english-learn/mobile exec playwright install chromium webkit   # first time only
pnpm --filter @english-learn/mobile e2e:web
```

Android APK/AAB builds (EAS or local Gradle) and web hosting headers are covered in
[apps/mobile/README.md](apps/mobile/README.md#android-builds).

## Roadmap

**Phase 1.5: listening and speaking (still offline)**

- Text-to-speech for prompts and sentences, dictation and listening exercises.
- Dialogues and guided writing.
- Speaking practice through the device's native speech recognition.

**Phase 2: optional backend**

- FastAPI + PostgreSQL to sync progress across devices.
- Downloadable content packs.
- Calibrate placement item difficulties (IRT) from real response data.

**Known limitations** are listed in
[apps/mobile/README.md](apps/mobile/README.md#known-limitations) (for example, a reading exercise
grades all its items with one verdict, and the web app works in one tab at a time).

## License

- **Code**: the source code is licensed under the [MIT License](LICENSE).
- **Third-party data keeps its own license**: the MIT License does not cover it. Example
  sentences from [Tatoeba](https://tatoeba.org) in `packages/content/data` are licensed
  [CC BY 2.0 FR](https://creativecommons.org/licenses/by/2.0/fr/) and credited as described in
  [Content and licensing](#content-and-licensing).
