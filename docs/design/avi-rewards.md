# Design: Avi's rewards, wardrobe and home presence

Status: **withdrawn (2026-11-05): plumas and wardrobe removed; Avi on home kept.** Kept as
history. Before that: approved, slices 1 to 3 implemented (see
[Slice 2 as built](#71-slice-2-as-built) and [Slice 3 as built](#72-slice-3-as-built)); the
owner took the five recommended answers in [Open questions](#8-open-questions).

> **Withdrawal (2026-11-05).** The owner judged that plumas and the wardrobe would not be used.
> Removed: the plumas rules and ledger, the catalogue, `ProgressState.rewards`, the summary row,
> the home balance, the one-time note, `/armario`, the item art and Avi's outfits. Kept: Avi on
> home (section 5 and 7.2) with its moods, bubble, moments, hover and blink, but decorative (no
> button, hidden from screen readers, the bubble carries the state) and without the "new outfit"
> state or the twirl. Compatibility: `item_purchased` / `item_equipped` are retired event types
> the fold accepts with any payload and ignores, with no anomaly; the API is unchanged.
> `FOLD_SNAPSHOT_VERSION` went to 3 and SQLite migration 7 drops the `rewards` cache table and
> the `plumas_welcome` setting. The rest of this document describes the design as it was.

Learners earn **plumas** for studying well and on time, and spend them dressing **Avi**, the
paper-plane mascot (`apps/mobile/src/shared/ui/mascot.tsx`). Album badges unlock exclusive items.
On home, Avi reacts to the learner coming back, to achievements and to a broken streak.
Everything is derived from the progress event log, so it works offline and follows sync.

## 1. Goals and non-goals

| Goals                                                                                                         | Non-goals (v1)                                                |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Reward **consistency and quality** (study days, first and perfect lessons, on-time reviews), never raw volume | Paid currency, ads, in-app purchases                          |
| A cosmetic sink: about 20 in-house SVG items for Avi                                                          | Gameplay power-ups (streak freezes, hints, XP boosts)         |
| Badges (the existing album) unlock exclusive items                                                            | A separate badge system: the album stays the only one         |
| Avi reacts on home, with full reduced-motion fallbacks                                                        | Idle animation loops, notifications, push reminders           |
| Deterministic, sync-safe, old-device-safe data model                                                          | Leaderboards, gifting, trading, selling items back            |
| No dark patterns                                                                                              | Timers, limited-time items, "you will lose…" copy, loot boxes |

**Learning-science rationale.**

- **Overjustification.** Rewards that are paid for merely doing a task can crowd out intrinsic
  motivation. Rewards that report competence ("perfect page", "reviewed on time") tend not to.
  Plumas are therefore tied to mastery and spacing signals, not to answer counts.
- **Spacing effect.** Reviewing items when they are due is what makes them stick. "Repaso a
  tiempo" is the main repeatable income.
- **Self-determination theory.** Dressing Avi adds autonomy (choice) and relatedness (a
  companion). Competence stays with XP, the streak and the album.
- **Anti-farming.** Replaying content you already mastered earns nothing, and a daily cap stops
  long grinding sessions. Studying a little every day is the best strategy.

## 2. The economy

### 2.1 Earning rules (decided by the fold, never by the device)

| Source                | Plumas      | Exact rule (fold order)                                                                                      |
| --------------------- | ----------- | ------------------------------------------------------------------------------------------------------------ |
| Día de estudio        | +5          | First `session_completed` of a `localDate`                                                                   |
| Lección nueva         | +5          | First `session_completed` of a `lessonId` (lessons **and** cards; same rule as the XP bonus in `fold.ts`)    |
| Página perfecta       | +10         | `accuracy === 1` and that lesson's previous `bestAccuracy` was < 1 (or none). Once per `lessonId`, ever      |
| Repaso a tiempo       | +1 / item   | `item_reviewed` with grade ≥ 3 of an item whose state was **due** (`dueDate ≤ localDate`) before applying it |
| Repaso del día        | +5          | First `session_completed` with `kind: "review"` and `accuracy ≥ 0.8` on a `localDate`                        |
| Semana de estudio     | +15         | The run of consecutive `activeDates` reaches 7, 14, 21, … (outside the daily cap)                            |
| Bienvenida (baseline) | +5 / lesson | Each lesson id a `baseline_imported` adds to `completedLessonIds` for the first time (one-time, uncapped)    |

**Daily cap: 40 plumas per `localDate`** for every source except "Semana de estudio" and the
baseline. The capped total of a date is `min(40, Σ)`, so it does not depend on the order of the
events inside that date.

**Anti-farming rules**

| Behaviour                                 | Plumas                                                  | Why                                                                                                   |
| ----------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Perfect redo of an already-perfect lesson | 0                                                       | "Página perfecta" is once per `lessonId`                                                              |
| Imperfect → perfect redo                  | +10 once                                                | Rewards mastery, the thing we want                                                                    |
| Any replay of a done lesson               | 0 from "Lección nueva" (due items in it still pay)      | "Lección nueva" is once per `lessonId`; "Repaso a tiempo" pays any due item, wherever it is practised |
| Second, third… session on the same day    | 0 from "Día de estudio"                                 | Once per date                                                                                         |
| Practising items that are not due         | 0                                                       | Only due items earn "Repaso a tiempo" (mirrors `applyReview`)                                         |
| A second review session the same day      | 0 from "Repaso del día"; due items are already reviewed | Once per date                                                                                         |
| Answer XP (`answerXp`)                    | ignored                                                 | Plumas never scale with how many answers you give                                                     |
| A 3-hour binge                            | ≤ 40                                                    | Daily cap                                                                                             |

"Mi respuesta también es correcta" can turn a session perfect. That is accepted: disputes are
logged (`answer_disputed`) and the owner reviews them.

### 2.2 Catalogue (v1: 20 items, 16 for sale, 4 exclusive)

Slots: `head`, `neck`, `eyes`, `paper` (Avi's body colour), `sticker` (a decal on the tail).
One item per slot. Default: no items, white paper.

| Slot    | Item (UI name)     | Price | Unlock                                         |
| ------- | ------------------ | ----- | ---------------------------------------------- |
| head    | Gorra              | 80    | Shop                                           |
| head    | Gorro de lana      | 120   | Shop                                           |
| head    | Sombrero de paja   | 160   | Shop                                           |
| head    | Corona de papel    | 250   | Shop                                           |
| head    | Birrete            | —     | Album badge `level-a2` "Nivel A2 completo"     |
| neck    | Pañuelo            | 60    | Shop                                           |
| neck    | Moño               | 100   | Shop                                           |
| neck    | Bufanda de rayas   | 160   | Shop                                           |
| neck    | Bufanda B1         | —     | Album badge `level-b1` "Nivel B1 completo"     |
| eyes    | Gafas redondas     | 80    | Shop                                           |
| eyes    | Gafas de sol       | 120   | Shop                                           |
| eyes    | Gafas de aviador   | 200   | Shop                                           |
| eyes    | Gafas de lectura   | —     | Album badge `grammar-level` "Gramática al día" |
| paper   | Papel cielo        | 50    | Shop                                           |
| paper   | Papel menta        | 50    | Shop                                           |
| paper   | Papel cuadriculado | 180   | Shop                                           |
| paper   | Papel holográfico  | —     | Album badge `streak-30` "Un mes entero"        |
| sticker | Estrella           | 40    | Shop                                           |
| sticker | Corazón            | 40    | Shop                                           |
| sticker | Rayo               | 40    | Shop                                           |

Everything for sale: **1,730 plumas**. Cheapest: 40. Exclusive items are free once their badge
is won and cannot be bought. Badge ids come from
`apps/mobile/src/features/achievements/model/achievements.ts`.

### 2.3 Simulation

Assumptions: one new lesson or card per study day; casual learner 40 % perfect, about 8 due
items recalled per study day; daily learner 60 % perfect, about 10 recalled; both pass the daily
review at ≥ 80 %. Content: 42 lessons + 28 cards = 70 one-time sources.

| Per study day              | Casual (3 non-consecutive days/week) | Daily (7 days/week) |
| -------------------------- | ------------------------------------ | ------------------- |
| Día de estudio             | 5                                    | 5                   |
| Lección nueva              | 5                                    | 5                   |
| Página perfecta (expected) | 4                                    | 6                   |
| Repaso a tiempo            | 8                                    | 10                  |
| Repaso del día             | 5                                    | 5                   |
| **Per day**                | **27**                               | **31**              |
| Semana de estudio          | 0                                    | +15 / week          |
| **Per week**               | **≈ 81**                             | **≈ 232**           |

| Milestone                                         | Casual                | Daily               |
| ------------------------------------------------- | --------------------- | ------------------- |
| First item (40)                                   | 2nd study day, week 1 | Day 2               |
| First mid-price item (120)                        | 5th study day, week 2 | Day 4               |
| Everything for sale (1,730)                       | ≈ 21 weeks (5 months) | ≈ 7.5 weeks         |
| After all 70 lessons/cards are done               | 18/day → ≈ 54/week    | 20/day → ≈ 155/week |
| Worst-case farming day (10 perfect replays)       | 5 + its due items     | 5 + its due items   |
| Best-case day (3 new perfect lessons, 15 reviews) | 70 → capped at 40     | 40                  |

The sink lasts about two months for the most engaged learners. New items should ship with
content packs (see Open question 5).

## 3. Data model

### 3.1 Events (payload `v: 1`, see `packages/domain/src/progress-log/events.ts`)

| `type`           | Payload                                       | Written when                                                             |
| ---------------- | --------------------------------------------- | ------------------------------------------------------------------------ |
| `item_purchased` | `itemId` (≤ 64 chars), `price` (int 1–10,000) | The learner confirms a purchase                                          |
| `item_equipped`  | `slot` (snake_case ≤ 20), `itemId` or `null`  | The learner taps "Listo" in the wardrobe: one event per **changed** slot |

No event for earning: plumas are **derived** from existing events, exactly like XP. No event for
badges: they stay derived from progress and content (`achievementFacts`). That means existing
history earns plumas retroactively.

The price is in the payload, so a later price change never rewrites old balances, and the fold
needs no catalogue (the domain does not import content).

### 3.2 Fold rules (`packages/domain/src/progress-log/fold.ts`)

| Data             | Rule                                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------- |
| `earned`         | Σ of section 2.1, with the cap tracked per `localDate`                                                        |
| `earnedBySource` | Lifetime totals per source, so the summary can show a breakdown as after − before (like XP today)             |
| `overCap`        | Lifetime plumas the daily cap held back, so the summary knows a session hit the cap                           |
| `spent`          | Σ `price` of the **first** `item_purchased` per `itemId` in fold order; a repeat is a known no-op (no charge) |
| `balance`        | `earned − spent`. It can be negative after concurrent offline spends (see 3.3)                                |
| `ownedItemIds`   | Sorted ids with an applied purchase (unknown ids kept, so newer catalogues survive)                           |
| `equipped`       | Per slot, the last `item_equipped` in fold order (last-writer-wins per slot; unknown slots kept)              |

The cap is applied as plumas arrive: each award pays what is left of the day's 40. A day's total
is still `min(40, Σ)` whatever the order inside it, and `earnedBySource` adds up to `earned`
(the plumas the cap held back count in `overCap`, not in a source).

New snapshot fields (all tiny): `rewards: { earned, spent, earnedBySource, overCap, owned, equipped,
day: { date, earned, reviewBonus }, run: { lastDate, length } }`. Fold order is by `localDate`
first, so only the cursor's day needs per-day state. That keeps `advanceFold` exact without
extra refold cases. First completion and first perfect reuse `completedLessonIds` and
`lessonResults`, which are already in the snapshot.

**Ownership is decided in the app, not the fold.** The visible outfit is
`resolveOutfit(equipped, owned ∪ badgeItems(achievements), catalogue)`, which drops any item
this app version does not know or the learner does not own. The fold cannot know badges
(they need content), and this keeps it forward compatible.

### 3.3 Sync and conflicts

| Scenario                                                 | Result                                                                                                                                 |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Same item bought on two devices offline                  | Both events sync, and the first in fold order charges. The other is a no-op. **No double charge**                                      |
| Two different items bought offline, total > balance      | Both kept. Balance goes negative (for example −30). The shop disables buying until it is ≥ the price again. Items are never taken away |
| Equip on two devices                                     | Last per slot in `(localDate, occurredAt, id)` order wins on every device                                                              |
| Earning on device B arrives after a purchase on device A | Balance is a commutative sum, so every device converges on the same value                                                              |
| Purchase replayed (sync retry, transfer)                 | Deduped by event id like every event                                                                                                   |

The "debt" alternative to voiding the later purchase is Open question 2.

### 3.4 Old-device compatibility

- Apps without rewards skip `item_purchased` and `item_equipped` as `unsupported_event`
  (`validate.ts` → `parseEvent`). Progress is unchanged. The anomaly list grows by one per
  wardrobe event, which is bounded and small.
- Old devices still write `session_completed` and `item_reviewed`, so plumas earned there appear
  once a new device folds them.
- New devices meeting a newer catalogue (unknown `itemId` or slot) keep charging the price and
  hide the item.

### 3.5 Version, golden and storage impact

| Change                                                                                                                                                                    | Impact                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New snapshot fields + 2 event types + new earning rules                                                                                                                   | `FOLD_SNAPSHOT_VERSION` 1 → **2**, done once in slice 1 for all fold rules                                                                                                                                                                                                   |
| `FOLD_RULES_CORPUS` (`fold-rules.ts`) gains: perfect redo, cap overflow, 7-day run, due vs. not-due review, duplicate purchase, equip LWW, unknown slot, negative balance | Regenerate `fold-rules.golden.json` (`UPDATE_FOLD_GOLDEN=1 …`)                                                                                                                                                                                                               |
| `foldRulesFingerprint()` changes                                                                                                                                          | Every store refolds once on upgrade (≈ 250 ms, see `packages/storage-sqlite/README.md`)                                                                                                                                                                                      |
| `ProgressState` gains `rewards`, `ProgressTotals` gains `plumas`                                                                                                          | `ProgressRepository.getRewards()` (`packages/domain/src/ports/progress-repository.ts`), the SQLite adapter (a one-row `rewards` cache table, migration 6, written with the other caches so a write's totals stay a cheap read) and `src/testing/fake-progress-repository.ts` |
| Settings                                                                                                                                                                  | `SettingsRepository.get/setLastHomeVisit(date)` for the "welcome back" trigger (per device, not synced)                                                                                                                                                                      |

### 3.6 API

**No change.** `services/api` stores events opaquely: it accepts any snake_case `type` ≤ 40
characters and any payload ≤ 8 KiB (`sync/domain/limits.py`, `sync/api/schemas.py`) and never
folds. Both new types fit. The OpenAPI client is unchanged.

## 4. Rendering

### 4.1 Layered Avi (`mascot.tsx`)

`Avi` gains `outfit?: Outfit` (a slot → item art map). Everything stays in the **one** `Svg`
inside the existing `Animated.View`, so `tilt`, `facing` (mirror via `scaleX: -1`) and the
`fly` glide apply to items with no extra work.

| Layer (bottom → top) | Source                                             | Anchor in the 64×48 viewBox                                  |
| -------------------- | -------------------------------------------------- | ------------------------------------------------------------ |
| 1. Body              | `BODY` path, fill = paper item (default `#FFFFFF`) | —                                                            |
| 2. Tail sticker      | `sticker` slot                                     | (23, 21.6), about 9.5 units wide, rotated −17° with the edge |
| 3. Fold line         | `FOLD` path                                        | —                                                            |
| 4. Neck              | `neck` slot                                        | (36, 20), across the body behind the face                    |
| 5. Face              | eyes, mouth, cheek (mood)                          | eyes (43, 19) / (50, 16)                                     |
| 6. Eyes              | `eyes` slot                                        | centre (46.5, 17.5), rotated −23° along the eye line         |
| 7. Head              | `head` slot                                        | (46, 10) on the top edge `M3 23 → L61 5`, rotated −17°       |

- **Headroom.** Hats rise above y = 0. A dressed Avi uses `viewBox="0 -12 64 60"` with a
  negative top margin of `size × 12/64`, so the plane keeps its exact on-screen spot. Perches on
  the home path (`guide-heading.ts`) are unaffected. Covered by a layout test.
- **Mirroring.** Item art contains **no letters or numbers**. A mirrored "B1" would read
  backwards, so the B1 scarf uses B1's level colour and a star instead.
- **Small sizes.** At 40 pt (home guide) the sticker slot is hidden. A `detail` level per item
  drops strokes under 1 pt.
- **Moods.** Add `sad` (eyes as downward arcs, a flat mouth) to `AviMood`. Glasses sit over any
  mood, and `sleepy` keeps glasses on.
- **Dark mode.** Avi stays white paper in both schemes (the existing rule). Item outlines use
  `colors.ink` and fills use `palette.highlighters`, which already have dark-scheme values in
  `theme.ts`. Eye ink stays `#1B2333`, and every paper colour is a highlighter that is tested
  ≥ 4.5:1 against dark text. The holographic paper uses the album's three-colour stripes
  (`album-view.tsx`, `rare`), not a gradient (the design system has none).
- **Accessibility.** Avi stays decorative (`aria-hidden`). Where Avi is pressable, the wrapper
  carries the label.

### 4.2 Item art pipeline

| Step      | How                                                                                                                              |
| --------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Draw      | Hand-written SVG paths in code, like `mascot.tsx`, on the 64×48 grid around the slot anchor                                      |
| Files     | `apps/mobile/src/features/wardrobe/art/<slot>/<item>.tsx`, each exporting `{ id, slot, Art }`                                    |
| Catalogue | `packages/domain/src/rewards/catalog.ts`: ids, slots, prices and badge ids (pure data, used by the app; the fold never reads it) |
| Review    | A dev-only screen (`/__wardrobe`, e2e builds only) that renders every item × mood × facing × scheme. Playwright screenshots it   |
| Count     | **16 hand-drawn shapes** (5 head, 4 neck, 4 eyes, 3 stickers). Paper: 2 plain fills, 1 grid pattern, 1 stripe pattern            |
| Licence   | Original art only. No third-party assets or icon fonts                                                                           |

## 5. Avi on home

A **hero Avi** (56 pt) sits beside the greeting (`features/home/home-greeting.tsx`). It is
dressed and opens the wardrobe when tapped. The path guide and the nap Avi
(`home-view.tsx`) wear the same outfit.

### 5.1 States and triggers (first match wins, evaluated on home focus)

| #   | State        | Trigger                                                                                                     | Mood   | Bubble (one line, `Text` muted)              |
| --- | ------------ | ----------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------- |
| 1   | Celebrate    | A lesson newly done (`completion-memory.ts`), a new badge or a newly unlocked item since home was last seen | cheer  | "¡Lo lograste!"                              |
| 2   | New outfit   | Back from the wardrobe with changes                                                                         | cheer  | "¿Cómo me veo?"                              |
| 3   | Missed you   | `!isStreakAlive(streak, today)` and `streak.longest > 0` and no session today                               | sad    | "Te extrañé. Hoy empezamos una racha nueva." |
| 4   | Welcome back | First home visit of a new `localDate` (`lastHomeVisit < today`)                                             | happy  | "¡Qué bueno verte!"                          |
| 5   | Resting      | Nothing to review and studied today                                                                         | sleepy | "Todo listo por hoy."                        |
| 6   | Idle         | Otherwise                                                                                                   | happy  | —                                            |

The "missed you" state never mentions the lost number and offers no fix to buy. It perks up
(state 6) as soon as a session is saved.

### 5.2 Animations (`motion.ts` rules: transforms and opacity, ≤ 1.4 s, one moment per screen, nothing on its own while idle)

| Animation   | Used by                       | Motion                                       | Duration               | Reduced motion              |
| ----------- | ----------------------------- | -------------------------------------------- | ---------------------- | --------------------------- |
| Wave        | Welcome back                  | Tilt wiggles ±6° twice                       | 600 ms                 | Static, happy, bubble shown |
| Hop         | Celebrate                     | Rises 10 pt with `SLAP_SPRING` and lands     | ≈ 500 ms               | Static, cheer               |
| Loop        | Celebrate (new item or badge) | One 360° roll along an arc                   | 900 ms                 | Static, cheer               |
| Droop       | Missed you                    | Tilt +12°, 4 pt lower, and stays             | 400 ms                 | Final pose at once          |
| Perk up     | Leaving "missed you"          | Back to the default tilt                     | 250 ms                 | At once                     |
| Twirl       | New outfit, purchase          | `scaleX` 1 → −1 → 1 (turns around)           | 700 ms                 | Static, cheer               |
| Try-on drop | Wardrobe preview              | Item falls 8 pt onto its anchor and fades in | 220 ms (`MOTION.page`) | Appears at once             |
| Press       | Tapping Avi                   | Shared `PressableScale` (0.97)               | 90 ms                  | Already respected           |

The bubble text carries the state, so nothing depends on motion. Tests run with reduced motion
on (`jest.setup.js`), and `withMotion()` covers the animated path.

### 5.3 Sound (existing `SoundPlayer`, `infrastructure/sound/sound-player.ts`, no new assets in v1)

| Moment                   | Sound         | Note                                                               |
| ------------------------ | ------------- | ------------------------------------------------------------------ |
| Welcome back, missed you | none          | No sound without a gesture (web autoplay policy), and no guilt cue |
| Celebrate on home        | none          | The summary already played `achievement` (no double cue)           |
| Try an item on           | `tap`         | Like choosing an option                                            |
| Purchase confirmed       | `achievement` | The reward moment                                                  |
| "Listo" / any button     | `press`       | Automatic via `usePressSound`                                      |

## 6. Screens and UX flow

```text
Home ── tap hero Avi / "Plumas: 135" chip ──▶ /armario (wardrobe + shop)
Lesson summary ── "Plumas: +17" row ──▶ (no navigation; home chip updates)
/album ── won badge with a prize ── "Ver en el armario" ──▶ /armario?item=bufanda-b1
```

### 6.1 Wardrobe and shop: `/armario` (`features/wardrobe/`, container + view + `model/`)

| Region                 | Content                                                                                                                       |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Header                 | "El armario de Avi" · balance "Tienes 135 plumas" (feather drawn in SVG)                                                      |
| Preview                | Avi at 120 pt wearing the **trial** outfit, with a "Quitar todo" text button                                                  |
| Slot tabs              | "Gorros", "Cuello", "Gafas", "Papel", "Stickers": chips ≥ 44 pt tall, `accessibilityRole="tab"`                               |
| Item grid              | Sticker cards (3 per row, ≥ 96×120 pt). Each shows art, name and one status: price, "En tu armario", "En uso" or a badge lock |
| Action (pinned footer) | One button for the selected item: "Comprar por 120 plumas", "Usar", "Quitar", or disabled "Te faltan 20 plumas"               |
| Footer                 | "Listo" writes the `item_equipped` events for changed slots and goes back                                                     |

Trying items on is free and unlimited, and nothing is written until "Listo" or a purchase.
Purchases ask first, in an in-app dialog like `useLeaveConfirmation`'s: "¿Comprar el gorro de
lana por 120 plumas?" with "Comprar" and "Ahora no". Afterwards: "¡Listo! Avi ya tiene su gorro
de lana." (announced through a polite live region).

### 6.2 Badges: integrate with the album (`features/achievements/album-view.tsx`)

- No new gallery. The four album stickers with a prize get one extra line: "Premio: Bufanda B1".
- A won one adds a text button, "Ver en el armario".
- An unwon slot keeps its how-to and adds "Gana la bufanda B1".
- The summary's "Nueva insignia para tu álbum" card adds "y un premio para Avi" when it unlocks
  an item.

### 6.3 Earning feedback in the lesson summary (`features/lesson/components/session-screens.tsx`)

| Element               | Copy sample                                                                   |
| --------------------- | ----------------------------------------------------------------------------- |
| Results card row      | "Plumas: +17" (counts up with the XP, `MOTION.count`)                         |
| Breakdown (muted)     | "Día de estudio +5 · Lección nueva +5 · Repasos a tiempo +7"                  |
| Replay earned nothing | "Repetir no da plumas, pero te ayuda a recordar."                             |
| Cap reached           | "Ya ganaste las 40 plumas de hoy. Tu práctica sigue contando para tu repaso." |
| First perfect         | "Página perfecta +10"                                                         |

The breakdown is `earnedBySource` after − before, from `appendEvents`.

### 6.4 Accessibility

| Requirement   | How                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Labels        | Item card: "Gorro de lana, 120 plumas" · "Bufanda B1, se gana con la insignia Nivel B1 completo" · "Gafas de sol, en uso" |
| Hero Avi      | Button "Avi. Abrir el armario". The bubble is plain text                                                                  |
| Balance       | "Tienes 135 plumas". A negative balance reads "Debes 30 plumas"                                                           |
| Touch targets | ≥ 44 pt for tabs, cards, footer buttons and the hero                                                                      |
| Contrast      | AA: text uses the existing tested tokens (`theme.test.tsx`). Disabled buttons keep the muted token at ≥ 4.5:1             |
| Motion        | Section 5.2 fallbacks                                                                                                     |
| Copy          | Neutral Spanish with tú. `src/neutral-spanish.test.ts` scans the new files                                                |

## 7. Phased delivery plan

| Slice                          | Ships                                                                                                                                                                                                | Tests                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Plumas in the fold**      | Every fold rule (earning, cap, purchases, equips), `FOLD_SNAPSHOT_VERSION` 2, golden, port + SQLite + fake, the "Plumas" row on the summary, the balance chip on home. No new events are written yet | TDD per rule. fast-check properties: permutation invariance, duplication idempotence, two-device union convergence, `advanceFold` ≡ refold, `balance = earned − spent`, daily earned ≤ 40 + week bonus, **replaying a done perfect lesson on a day already studied adds nothing** (due items it reviews still pay "Repaso a tiempo"), duplicate purchase charges once. Golden regenerated |
| **2. Dressable Avi + shop**    | Layered `Avi` with `outfit`, 10 shop items (one or more per slot), `/armario` with try-on, purchase and "Listo", `item_purchased` / `item_equipped` written                                          | Unit tests for `resolveOutfit`, anchors and headroom layout. RNTL tests for the wardrobe container/view with the fake repo. Playwright: earn with `?today=`, buy, equip, reload (persists), a second device via the fake API (`e2e/account.spec.ts` pattern)                                                                                                                              |
| **3. Avi alive on home**       | Hero Avi, the `sad` mood, states 1–6, the animations table, sounds, `lastHomeVisit` setting                                                                                                          | Pure `homeAviState(...)` model with table tests. RNTL with `withMotion()` and reduced motion. Playwright with `emulateMedia({ reducedMotion: "reduce" })` and day jumps for "missed you"                                                                                                                                                                                                  |
| **4. Badges + full catalogue** | The other 6 shop items, 4 exclusives, album prize lines, the summary "premio" line, the `/__wardrobe` review screen                                                                                  | Badge → item mapping tests against the real corpus (every exclusive is winnable). Playwright screenshot of the review screen in both schemes                                                                                                                                                                                                                                              |

Each slice merges into `develop` alone and is usable on its own. Only slice 1 touches the fold.

### 7.1 Slice 2 as built

What changed from the plan above, and why:

| Topic             | As built                                                                                                                                                                                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Catalogue         | All **16 shop items** ship in slice 2 (not 10), so the whole sink exists from day one. The 4 badge prizes are in `catalog.ts` and show in the wardrobe as padlock cards ("Con insignia", "Se gana con la insignia …"); their art and unlocking stay in slice 4                       |
| Art files         | One file per slot (`features/wardrobe/art/{head,neck,eyes,sticker,paper}.tsx`) and a registry, `art/item-art.ts` (`ITEM_ART`, `outfitArt`), instead of one file per item                                                                                                             |
| Outfit everywhere | `AviOutfitContext` (in `mascot.tsx`) plus `WardrobeOutfitProvider` at the root layout: every `Avi` wears the learner's outfit with no change at its call sites; `outfit` overrides it (the wardrobe preview, card thumbnails). It reloads after a sync and after each wardrobe write |
| Ink               | Hats use `colors.ink` (they stand against the page). Neckwear, glasses and stickers lie on Avi's light paper, so they use Avi's face ink (`#1B2333`): the dark scheme's light ink was too faint on white paper                                                                       |
| Small sizes       | The tail sticker is **not** hidden at 40 pt: it stays (the home guide is the only Avi on home until slice 3), and pieces drop their detail strokes at ≤ 44 pt                                                                                                                        |
| Equip writes      | "Ponérselo" / "Quitárselo" write one `item_equipped` at once (no "Listo" batch and no "Quitar todo"): nothing is lost if the learner leaves with the back button, and each change syncs on its own                                                                                   |
| Labels            | "Ponérselo" / "Quitárselo" instead of "Usar" / "Quitar". Card labels: "Gorra, 80 plumas, comprado, puesto"                                                                                                                                                                           |
| Not enough plumas | A dashed key with "Te faltan 20 plumas" (muted text, AA) instead of a dimmed button (the 40 % opacity would fail contrast); it is exposed as a disabled button "Comprar por 60 plumas. Te faltan 20 plumas". A negative balance reads "Debes 30 plumas" in red pen                   |
| Try-on motion     | The preview Avi hops 8 pt (330 ms) instead of the item dropping onto its anchor (all layers share one `Svg`); none with reduced motion                                                                                                                                               |
| Entry points      | Home's plumas balance is a button ("Tienes 135 plumas", hint "Abre el armario de Avi"). No link from Cuenta (it is about the account and sync); the hero Avi arrives with slice 3. `/armario?item=<id>` opens on that item                                                           |
| Purchase guard    | `buyItem` checks the stored balance and ownership before writing, so a stale screen cannot overspend or buy twice on one device                                                                                                                                                      |

### 7.2 Slice 3 as built

What changed from sections 5 and 6.4, and why:

| Topic           | As built                                                                                                                                                                                                                                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Size and place  | 76 pt on phones, 96 pt from 768 px wide (not 56 pt): the owner found the outfit hard to see on the 40 pt path guide. Avi sits on the right of the greeting row, **mirrored** so it faces the page; the row is about 50 pt taller than the old greeting, so the path barely moves                                                            |
| Bubble          | A small speech bubble (sheet paper, ink outline, a tail pointing at Avi) under the greeting heading, in body text (not muted): it is the state's only carrier. It is a polite live region, so a screen reader says a new line once, not on every render                                                                                     |
| States          | The six of 5.1, in that order, from `homeAviState` (`features/home/model/home-avi.ts`), a pure function of the date, the hour, the streak, the last home visit, the reviews due, whether there is any progress, and what is new                                                                                                             |
| Celebrate       | A lesson completed since home was last seen (hop), or a new album badge (loop). Badge prizes unlock with slice 4                                                                                                                                                                                                                            |
| New outfit      | Also a newly **bought** item, not only a change of clothes (the animation table already twirls for a purchase). What is new is kept in memory for the app session (`createHomeAviMemory`), like `completion-memory.ts`: a reload celebrates nothing                                                                                         |
| Missed you      | As designed. Its button name says "con ganas de verte", never "triste"                                                                                                                                                                                                                                                                      |
| Welcome back    | Not on the very first visit (`lastHomeVisit` is null): that is a greeting, not a return. A failed settings read only skips this state                                                                                                                                                                                                       |
| Resting         | Also **at night**, 22:00 to 05:59 local time ("Ya es tarde. ¡Que descanses!"), after "missed you" and "welcome back"                                                                                                                                                                                                                        |
| Idle            | Not always quiet: a fresh learner gets "¡Hola! Soy Avi. ¿Empezamos?", and reviews due get "¿Repasamos un poco?"                                                                                                                                                                                                                             |
| Ambient motion  | **Deviation from "no idle loops"** (asked by the owner): a gentle hover (2.5 pt, 1.4 s up and 1.4 s down) and a blink (eyes shut 150 ms every 4 s). Both run only while home is the focused screen and the app or tab is visible (`useAppVisible`, over `AppState`, which follows `visibilitychange` on web), and never with reduced motion |
| Moments         | As in 5.2: wave 600 ms, hop ≈ 500 ms, loop 900 ms, twirl 700 ms, droop 400 ms (stays), perk up 250 ms. With reduced motion, the final pose at once (the droop's tilt and drop included)                                                                                                                                                     |
| Hero label      | "Avi, contento, con gorra y bufanda de rayas. Abre el armario" (state and outfit), instead of "Avi. Abrir el armario"                                                                                                                                                                                                                       |
| Sound           | None for the states (as designed); the tap clicks with the shared `press` sound, silent while sounds are off                                                                                                                                                                                                                                |
| `lastHomeVisit` | `SettingsRepository.get/setLastHomeVisit(date)` (SQLite `setting` key `last_home_visit`; an unreadable value reads as no visit), written once per new date when home loads                                                                                                                                                                  |
| Neckwear art    | The striped scarf (`Bufanda de rayas`) now wraps over the top edge: a collar across the edge, one end down the wing to the fold and one trailing back along the edge, close to the paper. In slice 2 its ends streamed high above the plane and it looked detached                                                                          |

## 8. Open questions

| #   | Question                                                                                    | Recommendation                                                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Should existing history earn plumas retroactively?                                          | **Yes.** It falls out of the derived model. Show a one-time "Avi te guardó N plumas por lo que ya estudiaste" for the "Bienvenida" grant (lessons done before the event log), decided on the first home visit that has progress |
| 2   | Concurrent offline overspend: allow a negative balance ("debt") or void the later purchase? | **Debt.** Items are never taken away, the balance is a commutative sum and the case needs two offline devices. Voiding would make an item disappear after a sync                                                                |
| 3   | Keep "Semana de estudio" (+15) despite the no-loss-aversion principle?                      | **Yes, positive-only.** No warnings, no countdown, no streak freeze for sale, and a broken run is never mentioned in numbers                                                                                                    |
| 4   | Does XP still matter once plumas exist?                                                     | **Yes.** XP stays the visible measure of effort (sheets, XP badges). Plumas are only for Avi, and they are never converted to or from XP                                                                                        |
| 5   | How does the sink grow after the catalogue is done?                                         | **4–6 new items per content pack, permanent, never time-limited.** Keep prices in the same 40–250 band                                                                                                                          |
