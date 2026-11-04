import { addDays, type LocalDate } from "../local-date";
import {
  DAILY_PLUMAS_CAP,
  NO_PLUMAS,
  PLUMAS_RULES,
  STUDY_WEEK_DAYS,
  UNCAPPED_PLUMAS_SOURCES,
  type PlumasBySource,
  type PlumasSource,
  type Rewards,
} from "../rewards";

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The fold's plumas state, as stored in the fold snapshot. Fold order is by `localDate` first,
 * so only the latest day needs per-day state (`day`), and the run of consecutive study days
 * needs only its last date and length: `advanceFold` stays exact without extra refold cases.
 */
export type RewardsSnapshot = {
  readonly earned: number;
  readonly spent: number;
  readonly earnedBySource: PlumasBySource;
  readonly overCap: number;
  /** Sorted ids of the items whose purchase charged. */
  readonly owned: readonly string[];
  /** Per slot, the last equip in fold order; keys sorted. */
  readonly equipped: Readonly<Record<string, string | null>>;
  /** The latest day a capped source paid on: what it paid so far and whether its review paid. */
  readonly day: {
    readonly date: LocalDate | null;
    readonly earned: number;
    readonly reviewBonus: boolean;
  };
  /** The current run of consecutive study days (dates of `session_completed`). */
  readonly run: { readonly lastDate: LocalDate | null; readonly length: number };
};

export const EMPTY_REWARDS_SNAPSHOT: RewardsSnapshot = {
  earned: 0,
  spent: 0,
  earnedBySource: NO_PLUMAS,
  overCap: 0,
  owned: [],
  equipped: {},
  day: { date: null, earned: 0, reviewBonus: false },
  run: { lastDate: null, length: 0 },
};

const UNCAPPED = new Set(UNCAPPED_PLUMAS_SOURCES);

/**
 * Applies the plumas rules as the fold walks the log in order. The fold decides WHEN a rule
 * applies (first completion, first perfect, a due item…); the ledger pays, caps and spends.
 *
 * The cap is applied as plumas arrive: each capped award pays what is left of the day's 40, so a
 * day's capped total is `min(40, Σ)` whatever the order inside it; the plumas held back are
 * counted in `overCap`, and `earnedBySource` adds up to `earned`.
 */
export class RewardsLedger {
  earned: number;
  spent: number;
  overCap: number;
  readonly bySource: Record<PlumasSource, number>;
  readonly owned: Set<string>;
  readonly equipped: Map<string, string | null>;
  day: { date: LocalDate | null; earned: number; reviewBonus: boolean };
  run: { lastDate: LocalDate | null; length: number };

  constructor(from: RewardsSnapshot) {
    this.earned = from.earned;
    this.spent = from.spent;
    this.overCap = from.overCap;
    this.bySource = { ...from.earnedBySource };
    this.owned = new Set(from.owned);
    this.equipped = new Map(Object.entries(from.equipped));
    this.day = { ...from.day };
    this.run = { ...from.run };
  }

  private enterDay(date: LocalDate): void {
    if (this.day.date !== date) this.day = { date, earned: 0, reviewBonus: false };
  }

  private award(source: PlumasSource, date: LocalDate, times = 1): void {
    const plumas = PLUMAS_RULES[source] * times;
    let paid = plumas;
    if (!UNCAPPED.has(source)) {
      this.enterDay(date);
      paid = Math.min(plumas, DAILY_PLUMAS_CAP - this.day.earned);
      this.day.earned += paid;
      this.overCap += plumas - paid;
    }
    this.earned += paid;
    this.bySource[source] += paid;
  }

  /** The first `session_completed` of `date`: "Día de estudio" and the study-week run. */
  studyDay(date: LocalDate): void {
    this.award("study_day", date);
    const continues = this.run.lastDate !== null && addDays(this.run.lastDate, 1) === date;
    this.run = { lastDate: date, length: continues ? this.run.length + 1 : 1 };
    if (this.run.length % STUDY_WEEK_DAYS === 0) this.award("study_week", date);
  }

  newLesson(date: LocalDate): void {
    this.award("new_lesson", date);
  }

  perfectPage(date: LocalDate): void {
    this.award("perfect_page", date);
  }

  onTimeReview(date: LocalDate): void {
    this.award("on_time_review", date);
  }

  /** A review session that passed: pays the first of `date` only. */
  dailyReview(date: LocalDate): void {
    this.enterDay(date);
    if (this.day.reviewBonus) return;
    this.day.reviewBonus = true;
    this.award("daily_review", date);
  }

  /** `lessons` lessons a baseline added to the completed ones (uncapped). */
  welcome(date: LocalDate, lessons: number): void {
    if (lessons > 0) this.award("welcome", date, lessons);
  }

  /** Charges the first purchase of an item; a repeat is a known no-op. */
  purchase(itemId: string, price: number): void {
    if (this.owned.has(itemId)) return;
    this.owned.add(itemId);
    this.spent += price;
  }

  equip(slot: string, itemId: string | null): void {
    this.equipped.set(slot, itemId);
  }

  snapshot(): RewardsSnapshot {
    return {
      earned: this.earned,
      spent: this.spent,
      earnedBySource: { ...this.bySource },
      overCap: this.overCap,
      owned: [...this.owned].sort(byText),
      equipped: sortedRecord(this.equipped),
      day: { ...this.day },
      run: { ...this.run },
    };
  }
}

function sortedRecord<T>(map: ReadonlyMap<string, T>): Record<string, T> {
  return Object.fromEntries([...map].sort(([a], [b]) => byText(a, b)));
}

/** The learner-facing rewards of a ledger snapshot. */
export function rewardsOf(snapshot: RewardsSnapshot): Rewards {
  return {
    earned: snapshot.earned,
    spent: snapshot.spent,
    balance: snapshot.earned - snapshot.spent,
    earnedBySource: snapshot.earnedBySource,
    overCap: snapshot.overCap,
    ownedItemIds: snapshot.owned,
    equipped: snapshot.equipped,
  };
}
