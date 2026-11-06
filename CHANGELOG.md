# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Removed

- **Plumas and Avi's wardrobe**: the plumas currency (summary row, home balance, one-time note),
  the `/armario` wardrobe and shop, and Avi's outfits. Avi stays on home with its moods, speech
  bubble, moments, hover and blink, now as decoration (no button, hidden from screen readers; the
  bubble carries its state), without the "new outfit" state. Wardrobe events (`item_purchased`,
  `item_equipped`) already in a log or on the sync server are still accepted and ignored. The
  fold snapshot format goes to version 3 (every store refolds once), and migration 7 drops the
  `rewards` cache table and the plumas note setting.

## [0.2.0] - 2026-11-03

Accounts and sync, a self-hosted API, an installable offline web app on its own domain, the sticker
notebook redesign and study cards.

### Added

- **Google sign-in and progress sync** (web): optional account with background sync of the
  progress event log, plus `/cuenta` and `/privacidad` pages. Signing in stays optional; the app
  keeps working offline without an account.
- **Self-hosted API**: FastAPI + PostgreSQL service for sign-in (Google ID tokens with nonce,
  rotating refresh tokens in an HttpOnly cookie, account deletion) and `POST /v1/sync`, with a
  typed TypeScript client generated from its OpenAPI schema. It runs with Docker Compose on a
  Raspberry Pi 5 behind a Cloudflare Tunnel, with multi-arch images on GHCR, nightly backups and a
  restore drill.
- **Custom domain**: the web app moved to <https://english.maumar.com.ar>, deployed to Cloudflare
  Pages from `main`.
- **Progress transfer between web addresses**: the old address offers a one-click, single-use
  transfer of local progress to the new one, imported at `/importar` only after the learner
  confirms; afterwards the old address redirects.
- **Offline installable web app**: precaching service worker, web manifest, home screen icons and
  an update banner when a new version is available.
- **Study cards (Fichas)**: grammar, phrasal-verb and vocabulary cards with their own practice,
  in two packs (28 cards, then A2/B1 grammar gaps and technology phrasal verbs). A missed exercise
  offers its card (_Ver ficha_), each practiced card shows its best result, and two new album
  stickers reward them.
- **Lesson recap and results**: the summary lists the lesson's new items ("Lo nuevo de hoy") with
  links to their cards and offers a redo; the home path shows each completed lesson's best result
  and a "Profundiza" step linking 24 lessons to the cards that go deeper.
- **Writing feedback**: free-text answers are graded against broad answer patterns, the wrong
  words are marked with corrections, one extra or missing function word counts as "almost", and
  common Spanish calques get a hint. Learners can mark an answer as also correct.
- **Theme selector**: Sistema / Claro / Oscuro next to the sound switch, applied before first
  paint on web.
- **Word lookups**: tap a word in an exercise for its English-Spanish glossary entry; lookups
  lock until answered and cap that item's review grade.
- **Sticker album** (`/album`): sixteen achievements derived from the stored progress, announced
  on the summary with a new synthesized sound.
- Interaction sounds and haptics with a remembered sound switch, colored highlighters for topics
  and levels, and a list of the words to review on the session summary.
- Word-order exercises let learners drag strips onto the line and reorder them.

### Changed

- **Game redesign, "el cuaderno de stickers"**: home shows the streak as a chain of paperclips,
  XP as sheets of stickers and the level's lessons as a path of stickers with Avi, the
  paper-plane mascot, at the next one; exercises show one colored step per answer and a feedback
  band with the points earned and a cheer for three right answers in a row; the summary
  celebrates with the lesson's sticker, confetti and the teacher's cheer. Brighter sticker
  colors and ink, with AA contrast kept.
- **Motion**: page turns between exercises, red-pen strikes, a perfect-page stamp, XP count-up
  and streak roll, all respecting reduced motion.
- **Progress storage**: progress is an append-only event log with a deterministic fold, the base
  for sync and transfer.
- **Review priority**: items still in their first steps come before the review backlog, and every
  item a lesson teaches is reviewable.
- **Content**: linguistic review of both card packs, the glossary and the lessons; content text
  is checked against voseo so Spanish stays neutral.
- App icon, favicon and PWA icons use the sticker notebook palette.

### Fixed

- **iOS PWA database opening**: the database opens once per page without probing its files,
  another tab is claimed only on positive evidence, busy files are retried for about 16 seconds
  from a calm loading screen, and the Google callback no longer needs the database.
- **Sign-out** finishes deleting local progress, cancelling any sync in flight, before showing
  the signed-out state.
- The web database is handed between tabs instead of blocking reloads.
- Web sounds play offline on WebKit through Web Audio.
- `/cuenta`, `/privacidad` and `/about` always offer a way home.
- Home and the summary no longer flash "0 días" before the streak loads.
- The account and privacy screens use _tú_ instead of voseo.

### Performance

- **Incremental fold**: each write folds only the new events onto a stored snapshot; a golden
  corpus and a rules fingerprint pin the fold rules and trigger a full refold when they change.

### Security

- API hardening: idle and absolute session lifetimes, refresh reuse detection with family
  locking, a recent sign-in required to delete the account, rate limits, JWT key rotation,
  events bound to their owner's devices, SQL parameters kept out of logs, and client IPs trusted
  only from the configured proxy.
- Progress transfers are anonymous, single use and bounded: request limits before reading the
  body, a capacity cap, purging of stale transfers, an 8 MiB decompression cap, and the token
  kept out of the address bar.

## [0.1.0] - 2026-10-29

First MVP release: an offline-first English course for Spanish speakers, for web and Android from
one Expo codebase.

### Added

- **Placement test**: adaptive test (3PL model, EAP estimation, max 20 questions) that suggests a
  starting CEFR level; it can be retaken from home.
- **Lessons** with six written exercise types: vocabulary, cloze, word order, translation choice,
  reading comprehension and free-text translation (typo- and contraction-tolerant grading).
- **Daily review** scheduled with SM-2; the grade comes from correctness and response time.
  Replaying a lesson before its items are due counts as practice, not as a review.
- **Progress**: home shows XP, the daily streak, the placement CEFR level and which lessons
  are done.
- **Content**: 21 topic files for A2 and B1 (248 items, 293 exercises, 42 lessons, 22 reading
  passages) and 65 placement questions from A1 to C1, validated in CI. Example sentences from
  Tatoeba are attributed (CC BY 2.0 FR) in the app's About screen.
- **Offline storage**: SQLite via `expo-sqlite` (native, and WebAssembly + OPFS on web); a
  finished session is saved in one transaction.
- **Web build**: static SPA export with the cross-origin isolation headers SQLite needs, tested
  with Playwright on Chromium and WebKit.
- **Android build configuration**: package name, version code and EAS profiles (`preview` APK,
  `production` app bundle); unused template permissions are blocked.
- Leaving an unfinished lesson, review or placement test asks for confirmation.
- Clear error screens when the database cannot open (another tab, newer schema, storage
  unavailable).

[Unreleased]: https://github.com/mauruiz20/english-learn/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/mauruiz20/english-learn/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/mauruiz20/english-learn/releases/tag/v0.1.0
