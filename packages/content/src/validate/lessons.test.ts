import { describe, expect, it } from "vitest";
import { LessonSchema, type ContentFile } from "../schema";
import * as fx from "../testing/fixtures";
import {
  validateCorpus,
  validateLessonNewItems,
  validateReviewableLessonItems,
  type LoadedFile,
} from "./index";

const file = (data: ContentFile, name = "b1/travel.json"): LoadedFile => ({ file: name, data });

/** `validFile()` with a second item practiced by the lesson's cloze and translate_write. */
function twoItemFile(lessonPatch: Partial<ReturnType<typeof fx.lesson>> = {}): ContentFile {
  const f = fx.validFile();
  const book = fx.item({ id: "b1.travel.book", term: "book", es: "reservar" });
  return {
    ...f,
    items: [...(f.items ?? []), book],
    exercises: (f.exercises ?? []).map((e) =>
      e.type === "cloze" ? { ...e, itemIds: [...e.itemIds, book.id] } : e,
    ),
    lessons: [fx.lesson(lessonPatch)],
  };
}

describe("LessonSchema newItemIds", () => {
  it("is optional", () => {
    expect(LessonSchema.safeParse(fx.lesson()).success).toBe(true);
  });

  it("takes 3 to 5 ids", () => {
    const ids = ["b1.travel.a", "b1.travel.b", "b1.travel.c", "b1.travel.d", "b1.travel.e"];
    expect(LessonSchema.safeParse(fx.lesson({ newItemIds: ids.slice(0, 3) })).success).toBe(true);
    expect(LessonSchema.safeParse(fx.lesson({ newItemIds: ids })).success).toBe(true);
    expect(LessonSchema.safeParse(fx.lesson({ newItemIds: ids.slice(0, 2) })).success).toBe(false);
    expect(LessonSchema.safeParse(fx.lesson({ newItemIds: [...ids, "b1.travel.f"] })).success).toBe(
      false,
    );
  });

  it("rejects ids that are not content ids", () => {
    const parsed = LessonSchema.safeParse(
      fx.lesson({ newItemIds: ["b1.travel.a", "b1.travel.b", "Travel"] }),
    );
    expect(parsed.success).toBe(false);
  });
});

describe("validateLessonNewItems", () => {
  it("passes when every new item is practiced by the lesson", () => {
    // The count (3 to 5) is the schema's; this rule checks references.
    const data = twoItemFile({ newItemIds: ["b1.travel.book", "b1.travel.although"] });
    expect(validateLessonNewItems([file(data)])).toEqual([]);
  });

  it("passes for lessons without new items", () => {
    expect(validateLessonNewItems([file(fx.validFile())])).toEqual([]);
  });

  it("reports a new item the lesson's exercises do not practice", () => {
    const data = twoItemFile({
      newItemIds: ["b1.travel.although", "b1.travel.book", "b1.travel.missing"],
    });
    expect(validateLessonNewItems([file(data)])).toEqual([
      {
        file: "b1/travel.json",
        path: "lessons[0].newItemIds[2]",
        message: 'new item "b1.travel.missing" is not practiced by any exercise of the lesson',
      },
    ]);
  });

  it("reports duplicates", () => {
    const data = twoItemFile({
      newItemIds: ["b1.travel.although", "b1.travel.book", "b1.travel.book"],
    });
    expect(validateLessonNewItems([file(data)])).toEqual([
      {
        file: "b1/travel.json",
        path: "lessons[0].newItemIds[2]",
        message: 'duplicate new item "b1.travel.book"',
      },
    ]);
  });
});

describe("validateReviewableLessonItems", () => {
  it("passes when every lesson item has a non-reading exercise", () => {
    expect(validateReviewableLessonItems([file(fx.validFile())])).toEqual([]);
  });

  it("reports a lesson item that only a reading exercise practices", () => {
    const f = fx.validFile();
    const windy = fx.item({ id: "b1.travel.windy", term: "windy", es: "ventoso" });
    const data: ContentFile = {
      ...f,
      items: [...(f.items ?? []), windy],
      exercises: (f.exercises ?? []).map((e) =>
        e.type === "reading" ? { ...e, itemIds: [...e.itemIds, windy.id] } : e,
      ),
      lessons: [fx.lesson({ exerciseIds: [...fx.lesson().exerciseIds, fx.reading().id] })],
    };
    expect(validateReviewableLessonItems([file(data)])).toEqual([
      {
        file: "b1/travel.json",
        path: "lessons[0]",
        message:
          'item "b1.travel.windy" is only practiced by reading exercises, so the daily review can never bring it back; add a non-reading exercise for it',
      },
    ]);
  });

  it("is part of validateCorpus", () => {
    const f = fx.validFile();
    const data: ContentFile = {
      ...f,
      lessons: [fx.lesson({ newItemIds: ["b1.travel.although", "b1.travel.x", "b1.travel.y"] })],
    };
    const errs = validateCorpus([file(data), ...fx.glossaryFiles()]);
    expect(errs.map((e) => e.path)).toContain("lessons[0].newItemIds[1]");
  });
});
