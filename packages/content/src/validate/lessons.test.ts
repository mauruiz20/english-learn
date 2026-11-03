import { describe, expect, it } from "vitest";
import { LessonSchema, type ContentFile } from "../schema";
import * as fx from "../testing/fixtures";
import {
  validateCorpus,
  validateLessonDeepenCards,
  validateLessonNewItems,
  validateTopicDeepenCards,
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

describe("LessonSchema deepenCardIds", () => {
  it("is optional and takes 1 to 3 card ids", () => {
    const ids = ["b1.grammar.a", "b1.grammar.b", "b1.grammar.c", "b1.grammar.d"];
    expect(LessonSchema.safeParse(fx.lesson({ deepenCardIds: ids.slice(0, 1) })).success).toBe(
      true,
    );
    expect(LessonSchema.safeParse(fx.lesson({ deepenCardIds: ids.slice(0, 3) })).success).toBe(
      true,
    );
    expect(LessonSchema.safeParse(fx.lesson({ deepenCardIds: [] })).success).toBe(false);
    expect(LessonSchema.safeParse(fx.lesson({ deepenCardIds: ids })).success).toBe(false);
    expect(LessonSchema.safeParse(fx.lesson({ deepenCardIds: ["Grammar"] })).success).toBe(false);
  });
});

describe("validateLessonDeepenCards", () => {
  const lessonFile = (lessonPatch: Partial<ReturnType<typeof fx.lesson>>, level = "B1") => {
    const f = fx.validFile();
    return file(
      { ...f, lessons: [fx.lesson({ ...lessonPatch })] },
      `${level.toLowerCase()}/travel.json`,
    );
  };

  it("passes when every linked card exists at or below the lesson level", () => {
    const a2Card = fx.card({ id: "a2.grammar.although", level: "A2" });
    const files = [
      lessonFile({ deepenCardIds: ["b1.grammar.although", "a2.grammar.although"] }),
      fx.cardFile(),
      { file: "a2/grammar.json", data: { cards: [a2Card] } },
    ];
    expect(validateLessonDeepenCards(files)).toEqual([]);
  });

  it("passes for lessons without linked cards", () => {
    expect(validateLessonDeepenCards([file(fx.validFile()), fx.cardFile()])).toEqual([]);
  });

  it("reports an unknown card", () => {
    const files = [lessonFile({ deepenCardIds: ["b1.grammar.missing"] }), fx.cardFile()];
    expect(validateLessonDeepenCards(files)).toEqual([
      {
        file: "b1/travel.json",
        path: "lessons[0].deepenCardIds[0]",
        message: 'card "b1.grammar.missing" does not exist',
      },
    ]);
  });

  it("reports a card above the lesson level", () => {
    const c1Card = fx.card({ id: "c1.grammar.although", level: "C1" });
    const files = [
      lessonFile({ deepenCardIds: ["c1.grammar.although"] }),
      { file: "c1/grammar.json", data: { cards: [c1Card] } },
    ];
    expect(validateLessonDeepenCards(files)).toEqual([
      {
        file: "b1/travel.json",
        path: "lessons[0].deepenCardIds[0]",
        message: 'card "c1.grammar.although" is C1, above the lesson level B1',
      },
    ]);
  });

  it("reports duplicates", () => {
    const files = [
      lessonFile({ deepenCardIds: ["b1.grammar.although", "b1.grammar.although"] }),
      fx.cardFile(),
    ];
    expect(validateLessonDeepenCards(files)).toEqual([
      {
        file: "b1/travel.json",
        path: "lessons[0].deepenCardIds[1]",
        message: 'duplicate linked card "b1.grammar.although"',
      },
    ]);
  });

  it("is part of validateCorpus", () => {
    const files = [
      lessonFile({ deepenCardIds: ["b1.grammar.missing"] }),
      fx.cardFile(),
      ...fx.glossaryFiles(),
    ];
    expect(validateCorpus(files).map((e) => e.path)).toContain("lessons[0].deepenCardIds[0]");
  });
});

describe("validateTopicDeepenCards", () => {
  const lessonsFile = (lessons: ReturnType<typeof fx.lesson>[], name = "b1/travel.json") =>
    file({ ...fx.validFile(), lessons }, name);
  const first = (deepenCardIds: string[]) => fx.lesson({ deepenCardIds });
  const second = (deepenCardIds: string[]) =>
    fx.lesson({ id: "b1.travel.lesson-002", deepenCardIds });

  it("passes when each card is linked by one lesson of the topic", () => {
    const files = [
      lessonsFile([first(["b1.grammar.although"]), second(["b1.grammar.unless"])]),
      fx.cardFile(),
    ];
    expect(validateTopicDeepenCards(files)).toEqual([]);
  });

  it("passes when lessons of different topics link the same card", () => {
    const other = fx.lesson({
      id: "b1.city-life.lesson-001",
      topic: "city-life",
      deepenCardIds: ["b1.grammar.although"],
    });
    const files = [
      lessonsFile([first(["b1.grammar.although"])]),
      lessonsFile([other], "b1/city-life.json"),
    ];
    expect(validateTopicDeepenCards(files)).toEqual([]);
  });

  it("passes when lessons of the same topic name at different levels link the same card", () => {
    const a2 = fx.lesson({
      id: "a2.travel.lesson-001",
      level: "A2",
      deepenCardIds: ["a2.grammar.although"],
    });
    const files = [
      lessonsFile([first(["a2.grammar.although"])]),
      lessonsFile([a2], "a2/travel.json"),
    ];
    expect(validateTopicDeepenCards(files)).toEqual([]);
  });

  it("reports a card linked by two lessons of the same topic, on the later lesson", () => {
    const files = [
      lessonsFile([
        first(["b1.grammar.although"]),
        second(["b1.grammar.unless", "b1.grammar.although"]),
      ]),
    ];
    expect(validateTopicDeepenCards(files)).toEqual([
      {
        file: "b1/travel.json",
        path: "lessons[1].deepenCardIds[1]",
        message:
          'card "b1.grammar.although" is already linked by "b1.travel.lesson-001", a lesson of the same topic; link it to the lesson that teaches it',
      },
    ]);
  });

  it("is part of validateCorpus", () => {
    const files = [
      lessonsFile([first(["b1.grammar.although"]), second(["b1.grammar.although"])]),
      fx.cardFile(),
      ...fx.glossaryFiles(),
    ];
    expect(validateCorpus(files).map((e) => e.path)).toContain("lessons[1].deepenCardIds[0]");
  });
});
