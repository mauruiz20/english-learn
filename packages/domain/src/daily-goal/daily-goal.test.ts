import { describe, expect, it } from "vitest";
import { localDate } from "../local-date";
import {
  DAILY_GOALS,
  DEFAULT_DAILY_GOAL,
  dailyGoalStatus,
  dailyGoalTarget,
  exercisesOn,
  isDailyGoal,
} from "./daily-goal";

const d1 = localDate("2026-11-05");
const d2 = localDate("2026-11-06");

describe("daily goal", () => {
  it("offers light 10, normal 20, intense 40 and no goal, normal by default", () => {
    expect(DAILY_GOALS).toEqual(["light", "normal", "intense", "off"]);
    expect(DAILY_GOALS.map(dailyGoalTarget)).toEqual([10, 20, 40, null]);
    expect(DEFAULT_DAILY_GOAL).toBe("normal");
  });

  it("recognizes only the known goals", () => {
    expect(DAILY_GOALS.every(isDailyGoal)).toBe(true);
    for (const value of ["", "Normal", "20", null, undefined, 20]) {
      expect(isDailyGoal(value)).toBe(false);
    }
  });

  it("is off with no goal, whatever was done", () => {
    expect(dailyGoalStatus("off", 0)).toEqual({ kind: "off" });
    expect(dailyGoalStatus("off", 50)).toEqual({ kind: "off" });
  });

  it("is in progress below the target and met at or above it", () => {
    expect(dailyGoalStatus("normal", 0)).toEqual({
      kind: "on",
      done: 0,
      target: 20,
      met: false,
    });
    expect(dailyGoalStatus("normal", 19)).toEqual({
      kind: "on",
      done: 19,
      target: 20,
      met: false,
    });
    expect(dailyGoalStatus("normal", 20)).toEqual({ kind: "on", done: 20, target: 20, met: true });
    expect(dailyGoalStatus("light", 26)).toEqual({ kind: "on", done: 26, target: 10, met: true });
    expect(dailyGoalStatus("intense", 26)).toEqual({
      kind: "on",
      done: 26,
      target: 40,
      met: false,
    });
  });

  it("never counts below zero or a fraction", () => {
    expect(dailyGoalStatus("light", -3)).toEqual({ kind: "on", done: 0, target: 10, met: false });
    expect(dailyGoalStatus("light", 4.7)).toEqual({ kind: "on", done: 4, target: 10, met: false });
  });

  it("reads the exercises of one date, zero for a day without them (a new day resets)", () => {
    const daily = [
      { localDate: d1, exercises: 14 },
      { localDate: d2, exercises: 6 },
    ];
    expect(exercisesOn(daily, d1)).toBe(14);
    expect(exercisesOn(daily, d2)).toBe(6);
    expect(exercisesOn(daily, localDate("2026-11-07"))).toBe(0);
    expect(exercisesOn([], d1)).toBe(0);
  });
});
