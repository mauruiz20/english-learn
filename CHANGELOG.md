# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
  `production` app bundle).
- Leaving an unfinished lesson, review or placement test asks for confirmation.
- Clear error screens when the database cannot open (another tab, newer schema, storage
  unavailable).

<!-- Version compare links will be added once the repository is published on GitHub. -->
