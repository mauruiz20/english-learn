import { describe, expect, it } from "vitest";
import { addDays, localDate } from "../local-date";
import { DAILY_PLUMAS_CAP, EMPTY_REWARDS, PLUMAS_RULES } from "../rewards";
import {
  baselineImported,
  itemEquipped,
  itemPurchased,
  itemReviewed,
  lessonCompleted,
  reviewCompleted,
} from "../test-support/progress-events";
import type { StoredEvent } from "./events";
import { foldEvents } from "./fold";

const D1 = localDate("2026-03-02");
const day = (n: number) => addDays(D1, n);

let next = 0;
const meta = (localDate = D1, occurredAt = 0) => ({
  id: `e${String(next++).padStart(4, "0")}`,
  localDate,
  occurredAt,
});

const rewardsOf = (events: readonly StoredEvent[]) => foldEvents(events).rewards;

/** A lesson session saved on `date`: reviews of `items` (grade 5) then its completion. */
function lessonSession(
  date: ReturnType<typeof day>,
  sessionId: string,
  lessonId: string,
  accuracy: number,
  items: readonly string[] = [],
  at = 0,
): StoredEvent[] {
  return [
    ...items.map((itemId, k) => itemReviewed(meta(date, at + k), sessionId, itemId, 5)),
    lessonCompleted(meta(date, at + items.length), sessionId, lessonId, 30, accuracy),
  ];
}

describe("plumas in the fold", () => {
  it("starts empty", () => {
    expect(foldEvents([]).rewards).toEqual(EMPTY_REWARDS);
    expect(EMPTY_REWARDS.balance).toBe(0);
  });

  it("pays Día de estudio and Lección nueva for a first imperfect lesson", () => {
    const rewards = rewardsOf(lessonSession(D1, "s1", "L1", 0.5));
    expect(rewards.earned).toBe(PLUMAS_RULES.study_day + PLUMAS_RULES.new_lesson);
    expect(rewards.earnedBySource).toMatchObject({ study_day: 5, new_lesson: 5, perfect_page: 0 });
    expect(rewards.balance).toBe(10);
  });

  it("pays Página perfecta once per lesson, also for an imperfect → perfect redo", () => {
    const first = lessonSession(D1, "s1", "L1", 0.5);
    const perfect = lessonSession(D1, "s2", "L1", 1, [], 10);
    const again = lessonSession(day(1), "s3", "L1", 1);
    expect(rewardsOf([...first, ...perfect]).earnedBySource.perfect_page).toBe(10);
    const all = rewardsOf([...first, ...perfect, ...again]);
    expect(all.earnedBySource.perfect_page).toBe(10);
    // The perfect redo on the same day adds only the perfect page; the next day only the day bonus.
    expect(all.earned).toBe(5 + 5 + 10 + 5);
  });

  it("pays nothing for a replay of a done lesson on a day already studied", () => {
    const first = lessonSession(D1, "s1", "L1", 1);
    const replay = lessonSession(D1, "s2", "L1", 1, [], 10);
    expect(rewardsOf([...first, ...replay])).toEqual(rewardsOf(first));
  });

  it("pays Lección nueva for cards too (saved as lessons) and not for baseline lessons", () => {
    const baseline = baselineImported(meta(D1), {
      states: [],
      xp: 0,
      streak: { current: 0, longest: 0, lastActiveDate: null },
      placement: null,
      completedLessonIds: ["L0"],
    });
    const rewards = rewardsOf([
      baseline,
      ...lessonSession(day(1), "s1", "L0", 0.5),
      ...lessonSession(day(1), "s2", "card-1", 0.5, [], 10),
    ]);
    expect(rewards.earnedBySource.new_lesson).toBe(5);
    expect(rewards.earnedBySource.welcome).toBe(5);
  });

  it("pays Bienvenida once per lesson a baseline adds, uncapped", () => {
    const lessons = Array.from({ length: 12 }, (_, n) => `L${n}`);
    const base = (completedLessonIds: string[]) =>
      baselineImported(meta(D1), {
        states: [],
        xp: 0,
        streak: { current: 0, longest: 0, lastActiveDate: null },
        placement: null,
        completedLessonIds,
      });
    const rewards = rewardsOf([
      ...lessonSession(D1, "s1", "L0", 0.5),
      base(lessons),
      base(lessons),
    ]);
    // L0 was already completed by a session; the second baseline adds nothing new.
    expect(rewards.earnedBySource.welcome).toBe(11 * PLUMAS_RULES.welcome);
    expect(rewards.overCap).toBe(0);
    expect(rewards.earned).toBe(10 + 55);
  });

  describe("Repaso a tiempo", () => {
    // i1 gets a state due the next day from a lesson on D1.
    const learn = lessonSession(D1, "s1", "L1", 1, ["i1", "i2"]);

    it("pays 1 per due item recalled (grade ≥ 3)", () => {
      const rewards = rewardsOf([
        ...learn,
        itemReviewed(meta(day(1)), "r1", "i1", 4),
        itemReviewed(meta(day(1)), "r1", "i2", 2),
        reviewCompleted(meta(day(1), 5), "r1", 10, 0.5),
      ]);
      expect(rewards.earnedBySource.on_time_review).toBe(1);
    });

    it("pays nothing for items that are not due or new", () => {
      const rewards = rewardsOf([
        ...learn,
        itemReviewed(meta(D1, 50), "s2", "i1", 5),
        itemReviewed(meta(D1, 50), "s2", "i9", 5),
        lessonCompleted(meta(D1, 60), "s2", "L1", 10, 1),
      ]);
      expect(rewards.earnedBySource.on_time_review).toBe(0);
    });
  });

  describe("Repaso del día", () => {
    it("pays the first review session of a day with accuracy ≥ 0.8, once per day", () => {
      const rewards = rewardsOf([
        reviewCompleted(meta(D1, 1), "r1", 10, 0.7),
        reviewCompleted(meta(D1, 2), "r2", 10, 0.8),
        reviewCompleted(meta(D1, 3), "r3", 10, 1),
        reviewCompleted(meta(day(1), 1), "r4", 10, 0.9),
      ]);
      expect(rewards.earnedBySource.daily_review).toBe(10);
      expect(rewards.earnedBySource.study_day).toBe(10);
    });
  });

  describe("Semana de estudio", () => {
    const studyOn = (n: number) => reviewCompleted(meta(day(n)), `w${n}`, 0, 0);

    it("pays 15 when a run of consecutive study days reaches 7, 14, …", () => {
      const days = Array.from({ length: 14 }, (_, n) => studyOn(n));
      expect(rewardsOf(days.slice(0, 6)).earnedBySource.study_week).toBe(0);
      expect(rewardsOf(days.slice(0, 7)).earnedBySource.study_week).toBe(15);
      expect(rewardsOf(days).earnedBySource.study_week).toBe(30);
    });

    it("starts the run again after a missed day", () => {
      const days = [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12].map(studyOn);
      expect(rewardsOf(days).earnedBySource.study_week).toBe(0);
      expect(rewardsOf([...days, studyOn(13)]).earnedBySource.study_week).toBe(15);
    });
  });

  describe("daily cap", () => {
    it("caps a day at 40 for every source but the week bonus and the welcome", () => {
      const sessions = Array.from({ length: 6 }, (_, n) =>
        lessonSession(D1, `s${n}`, `L${n}`, 1, [], n * 10),
      ).flat();
      const rewards = rewardsOf(sessions);
      // 5 (day) + 6 × (5 + 10) = 95 raw.
      expect(rewards.earned).toBe(DAILY_PLUMAS_CAP);
      expect(rewards.overCap).toBe(55);
      const bySource = Object.values(rewards.earnedBySource).reduce((a, b) => a + b, 0);
      expect(bySource).toBe(rewards.earned);
    });

    it("starts again the next day", () => {
      const sessions = [
        ...Array.from({ length: 6 }, (_, n) => lessonSession(D1, `s${n}`, `L${n}`, 1, [], n * 10)),
        ...Array.from({ length: 6 }, (_, n) =>
          lessonSession(day(1), `t${n}`, `M${n}`, 1, [], n * 10),
        ),
      ].flat();
      expect(rewardsOf(sessions).earned).toBe(80);
    });
  });

  describe("purchases and equips", () => {
    const earn = lessonSession(D1, "s1", "L1", 1); // 20 plumas

    it("charges the first purchase of an item once; a repeat is a no-op", () => {
      const rewards = rewardsOf([
        ...earn,
        itemPurchased(meta(day(1)), "estrella", 15),
        itemPurchased(meta(day(1), 5), "estrella", 15),
      ]);
      expect(rewards).toMatchObject({ spent: 15, balance: 5, ownedItemIds: ["estrella"] });
      expect(foldEvents([...earn, itemPurchased(meta(day(2)), "estrella", 15)]).anomalies).toEqual(
        [],
      );
    });

    it("allows a negative balance and keeps every item", () => {
      const rewards = rewardsOf([
        ...earn,
        itemPurchased(meta(day(1)), "gorra", 20),
        itemPurchased(meta(day(1), 1), "zz-future", 10),
      ]);
      expect(rewards).toMatchObject({ spent: 30, balance: -10 });
      expect(rewards.ownedItemIds).toEqual(["gorra", "zz-future"]);
    });

    it("keeps the last equip per slot in fold order, unknown slots and unequips too", () => {
      const rewards = rewardsOf([
        itemEquipped(meta(D1, 2), "head", "gorra"),
        itemEquipped(meta(D1, 1), "head", "birrete"),
        itemEquipped(meta(D1, 3), "future_slot", "x"),
        itemEquipped(meta(D1, 4), "neck", "panuelo"),
        itemEquipped(meta(day(1)), "neck", null),
      ]);
      expect(rewards.equipped).toEqual({ future_slot: "x", head: "gorra", neck: null });
    });

    it("rejects malformed purchases and equips as invalid events", () => {
      const bad: StoredEvent[] = [
        { ...itemPurchased(meta(), "x", 0) },
        { ...itemPurchased(meta(), "x".repeat(65), 10) },
        { ...itemPurchased(meta(), "x", 10.5) },
        { ...itemPurchased(meta(), "x", 10_001) },
        { ...itemEquipped(meta(), "Head", "x") },
        { ...itemEquipped(meta(), "a".repeat(21), "x") },
        { ...itemEquipped(meta(), "head", "") },
      ];
      const { anomalies, rewards } = foldEvents(bad);
      expect(anomalies.map((a) => a.kind)).toEqual(Array(bad.length).fill("invalid_event"));
      expect(rewards).toEqual(EMPTY_REWARDS);
    });
  });

  it("never pays plumas for answer XP", () => {
    const withXp = (answerXp: number) => [
      lessonCompleted(meta(D1), "s1", "L1", answerXp, 0.5),
      reviewCompleted(meta(D1, 9), "r1", answerXp, 0.5),
    ];
    expect(rewardsOf(withXp(1_000))).toEqual(rewardsOf(withXp(0)));
  });
});
