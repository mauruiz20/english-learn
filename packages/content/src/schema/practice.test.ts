import { describe, expect, it } from "vitest";
import * as fx from "../testing/fixtures";
import { ContentFileSchema } from "./content-file";
import { PracticeCollectionSchema, type PracticeGroup } from "./practice";

const group = (o: object = {}) => ({ ...fx.practiceCollection().groups[0], ...o }) as PracticeGroup;

describe("PracticeCollectionSchema", () => {
  it("accepts a collection with its groups", () => {
    expect(PracticeCollectionSchema.safeParse(fx.practiceCollection()).success).toBe(true);
  });

  it("is a content file key", () => {
    const parsed = ContentFileSchema.safeParse({ practice: [fx.practiceCollection()] });
    expect(parsed.success).toBe(true);
  });

  it("takes ids like practice.<collection> and practice.<collection>.<group>", () => {
    for (const id of ["phrasal-verbs", "practice.Phrasal", "b1.phrasal-verbs.x"]) {
      expect(PracticeCollectionSchema.safeParse(fx.practiceCollection({ id })).success).toBe(false);
    }
    for (const id of ["practice.phrasal-verbs", "travel", "practice.a.b.c"]) {
      const groups = [group({ id })];
      expect(PracticeCollectionSchema.safeParse(fx.practiceCollection({ groups })).success).toBe(
        false,
      );
    }
  });

  it("needs at least one group", () => {
    expect(PracticeCollectionSchema.safeParse(fx.practiceCollection({ groups: [] })).success).toBe(
      false,
    );
  });

  it("gives every group 2 or 3 lessons", () => {
    const withLessons = (lessonIds: string[]) =>
      PracticeCollectionSchema.safeParse(fx.practiceCollection({ groups: [group({ lessonIds })] }))
        .success;
    const ids = ["b1.phrasal-verbs.a", "b1.phrasal-verbs.b", "b1.phrasal-verbs.c"];
    expect(withLessons(ids.slice(0, 1))).toBe(false);
    expect(withLessons(ids.slice(0, 2))).toBe(true);
    expect(withLessons(ids)).toBe(true);
    expect(withLessons([...ids, "b1.phrasal-verbs.d"])).toBe(false);
  });

  it("labels every group with a CEFR level and Spanish texts", () => {
    const parse = (o: object) =>
      PracticeCollectionSchema.safeParse(fx.practiceCollection({ groups: [group(o)] })).success;
    expect(parse({ level: "B3" })).toBe(false);
    expect(parse({ title: "" })).toBe(false);
    expect(parse({ summary: " Viajes" })).toBe(false);
  });
});
