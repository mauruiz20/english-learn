import { describe, expect, it } from "vitest";
import * as fx from "../testing/fixtures";
import {
  INTRO_MISTAKE_NOTE_MAX,
  INTRO_POINT_MAX,
  LessonIntroSchema,
  LessonSchema,
  LevelIntroSchema,
} from "./index";

const ok = (value: unknown) => LessonIntroSchema.safeParse(value).success;
const levelOk = (value: unknown) => LevelIntroSchema.safeParse(value).success;
const example = { en: "We went out.", es: "Salimos." };

describe("LessonIntroSchema", () => {
  it("accepts an intro, with or without a mistake", () => {
    expect(ok(fx.lessonIntro())).toBe(true);
    const { mistake: _mistake, ...withoutMistake } = fx.lessonIntro();
    expect(ok(withoutMistake)).toBe(true);
  });

  it("is an optional lesson field", () => {
    expect(LessonSchema.safeParse(fx.lesson()).success).toBe(true);
    expect(LessonSchema.safeParse(fx.lesson({ intro: fx.lessonIntro() })).success).toBe(true);
    const empty = fx.lesson({ intro: fx.lessonIntro({ points: [] }) });
    expect(LessonSchema.safeParse(empty).success).toBe(false);
  });

  it("needs 2 to 4 points of at most 140 characters", () => {
    expect(INTRO_POINT_MAX).toBe(140);
    expect(ok(fx.lessonIntro({ points: ["Uno."] }))).toBe(false);
    expect(ok(fx.lessonIntro({ points: ["Uno.", "Dos.", "Tres.", "Cuatro."] }))).toBe(true);
    const five = ["Uno.", "Dos.", "Tres.", "Cuatro.", "Cinco."];
    expect(ok(fx.lessonIntro({ points: five }))).toBe(false);
    expect(ok(fx.lessonIntro({ points: ["a".repeat(140), "Dos."] }))).toBe(true);
    expect(ok(fx.lessonIntro({ points: ["a".repeat(141), "Dos."] }))).toBe(false);
  });

  it("needs 1 or 2 examples with English and Spanish", () => {
    expect(ok(fx.lessonIntro({ examples: [] }))).toBe(false);
    expect(ok(fx.lessonIntro({ examples: [example, example] }))).toBe(true);
    expect(ok(fx.lessonIntro({ examples: [example, example, example] }))).toBe(false);
    expect(ok(fx.lessonIntro({ examples: [{ en: "We went out.", es: "" }] }))).toBe(false);
  });

  it("limits the mistake's note to 120 characters", () => {
    expect(INTRO_MISTAKE_NOTE_MAX).toBe(120);
    const mistake = fx.lessonIntro().mistake!;
    expect(ok(fx.lessonIntro({ mistake: { ...mistake, note: "a".repeat(120) } }))).toBe(true);
    expect(ok(fx.lessonIntro({ mistake: { ...mistake, note: "a".repeat(121) } }))).toBe(false);
  });

  it("rejects blank or padded text and unknown keys", () => {
    expect(ok(fx.lessonIntro({ points: [" Uno.", "Dos."] }))).toBe(false);
    expect(ok({ ...fx.lessonIntro(), extra: 1 })).toBe(false);
    expect(ok({ ...fx.lessonIntro(), mistake: { wrong: "a", right: "b" } })).toBe(false);
  });
});

describe("LevelIntroSchema", () => {
  it("accepts a level intro", () => {
    expect(levelOk(fx.levelIntro())).toBe(true);
  });

  it("needs 3 to 5 can-do bullets and at least one topic", () => {
    const canDo = ["Uno.", "Dos.", "Tres.", "Cuatro.", "Cinco.", "Seis."];
    expect(levelOk(fx.levelIntro({ canDo: canDo.slice(0, 2) }))).toBe(false);
    expect(levelOk(fx.levelIntro({ canDo: canDo.slice(0, 5) }))).toBe(true);
    expect(levelOk(fx.levelIntro({ canDo }))).toBe(false);
    expect(levelOk(fx.levelIntro({ topics: [] }))).toBe(false);
  });

  it("rejects an unknown level and unknown keys", () => {
    expect(levelOk({ ...fx.levelIntro(), level: "C2" })).toBe(false);
    expect(levelOk({ ...fx.levelIntro(), extra: 1 })).toBe(false);
  });
});
