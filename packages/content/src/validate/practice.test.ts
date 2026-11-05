import { describe, expect, it } from "vitest";
import type { ContentFile, Lesson, PracticeCollection } from "../schema";
import * as fx from "../testing/fixtures";
import {
  validateCorpus,
  validateLayout,
  validatePracticeCollections,
  validatePracticeLessons,
  validateTopicDeepenCards,
  type LoadedFile,
} from "./index";

const PATH_FILE: LoadedFile = { file: "b1/travel.json", data: fx.validFile() };
const COLLECTION = "practice/phrasal-verbs/collection.json";
const GROUP_FILE = "practice/phrasal-verbs/travel.json";

/** `fx.practiceFiles()` with `patch` applied to the data of one of its files. */
function practice(patch: {
  collection?: Partial<PracticeCollection>;
  group?: Partial<ContentFile>;
}) {
  const [collection, group] = fx.practiceFiles() as [LoadedFile, LoadedFile];
  return [
    { ...collection, data: { practice: [fx.practiceCollection(patch.collection)] } },
    { ...group, data: { ...group.data, ...patch.group } },
  ];
}

const groupWith = (o: object) => [{ ...fx.practiceCollection().groups[0], ...o }] as never;

describe("practice content", () => {
  it("passes every rule next to the path's content", () => {
    expect(validateCorpus([PATH_FILE, ...fx.practiceFiles(), ...fx.glossaryFiles()])).toEqual([]);
  });
});

describe("validateLayout and practice/", () => {
  it("accepts collections and their groups' files under practice/<collection>/", () => {
    expect(validateLayout(fx.practiceFiles())).toEqual([]);
  });

  it("keeps collections in practice/ and practice/ free of cards and placement", () => {
    const errors = validateLayout([
      { file: "b1/travel.json", data: { practice: [fx.practiceCollection()] } },
      { file: "practice/phrasal-verbs/x.json", data: { cards: [fx.card()] } },
      { file: "practice/phrasal-verbs/y.json", data: { placement: [fx.placementQuestion()] } },
    ]);
    expect(errors).toEqual([
      {
        file: "b1/travel.json",
        path: "practice[0]",
        message: "practice collections belong in practice/<collection>/, not b1/",
      },
      {
        file: "practice/phrasal-verbs/x.json",
        path: "cards[0]",
        message: "practice/ may not contain cards",
      },
      {
        file: "practice/phrasal-verbs/y.json",
        path: "placement[0]",
        message: "practice/ may not contain placement",
      },
    ]);
  });

  it("needs a collection directory", () => {
    expect(validateLayout([{ file: "practice/x.json", data: {} }])).toEqual([
      {
        file: "practice/x.json",
        path: "(root)",
        message: "practice files must live in practice/<collection>/",
      },
    ]);
  });
});

describe("validatePracticeCollections", () => {
  it("passes for the fixture", () => {
    expect(validatePracticeCollections(fx.practiceFiles())).toEqual([]);
  });

  it("puts a collection in the directory named after its id", () => {
    const files = [
      { file: "practice/verbs/collection.json", data: { practice: [fx.practiceCollection()] } },
    ];
    expect(validatePracticeCollections(files)).toEqual([
      {
        file: "practice/verbs/collection.json",
        path: "practice[0].id",
        message: 'collection "practice.phrasal-verbs" belongs in practice/phrasal-verbs/',
      },
    ]);
  });

  it("prefixes group ids with the collection id and never repeats a lesson in a group", () => {
    const lessonIds = ["b1.phrasal-verbs.practice-travel-1", "b1.phrasal-verbs.practice-travel-1"];
    const files = practice({
      collection: { groups: groupWith({ id: "practice.other.travel", lessonIds }) },
    });
    expect(validatePracticeCollections(files)).toEqual([
      {
        file: COLLECTION,
        path: "practice[0].groups[0].id",
        message: 'group id must start with "practice.phrasal-verbs."',
      },
      {
        file: COLLECTION,
        path: "practice[0].groups[0].lessonIds[1]",
        message: 'duplicate lesson id "b1.phrasal-verbs.practice-travel-1"',
      },
    ]);
  });
});

describe("validatePracticeLessons", () => {
  it("passes for the fixture next to the path", () => {
    expect(validatePracticeLessons([PATH_FILE, ...fx.practiceFiles()])).toEqual([]);
  });

  it("reports duplicate collection and group ids", () => {
    const [collection, group] = fx.practiceFiles() as [LoadedFile, LoadedFile];
    const twice = {
      ...collection,
      data: { practice: [fx.practiceCollection(), fx.practiceCollection()] },
    };
    const messages = validatePracticeLessons([twice, group]).map((e) => `${e.path}: ${e.message}`);
    expect(messages).toContain('practice[1].id: duplicate collection id "practice.phrasal-verbs"');
    expect(messages).toContain(
      'practice[1].groups[0].id: duplicate group id "practice.phrasal-verbs.travel"',
    );
  });

  it("resolves every group lesson to a practice lesson of its collection at the group level", () => {
    const lessonIds = [
      "b1.phrasal-verbs.practice-travel-1",
      "b1.phrasal-verbs.missing",
      "b1.travel.lesson-001",
    ];
    const files = practice({
      collection: { groups: groupWith({ level: "B2", lessonIds }) },
    });
    const errors = validatePracticeLessons([PATH_FILE, ...files]);
    expect(errors).toEqual([
      {
        file: COLLECTION,
        path: "practice[0].groups[0].lessonIds[0]",
        message: 'lesson "b1.phrasal-verbs.practice-travel-1" is B1 but the group is B2',
      },
      {
        file: COLLECTION,
        path: "practice[0].groups[0].lessonIds[1]",
        message: 'unknown lesson id "b1.phrasal-verbs.missing"',
      },
      {
        file: COLLECTION,
        path: "practice[0].groups[0].lessonIds[2]",
        message:
          'lesson "b1.travel.lesson-001" is not in practice/phrasal-verbs/; a group lists its collection\'s practice lessons only',
      },
      {
        file: GROUP_FILE,
        path: "lessons[1]",
        message: 'practice lesson "b1.phrasal-verbs.practice-travel-2" is in no group',
      },
    ]);
  });

  it("puts every practice lesson in exactly one group", () => {
    const groups = [
      fx.practiceCollection().groups[0],
      {
        id: "practice.phrasal-verbs.again",
        level: "B1",
        title: "Otra vez",
        summary: "Lo mismo.",
        lessonIds: ["b1.phrasal-verbs.practice-travel-2", "b1.phrasal-verbs.practice-travel-1"],
      },
    ] as PracticeCollection["groups"];
    const errors = validatePracticeLessons(practice({ collection: { groups } }));
    expect(errors.map((e) => `${e.path}: ${e.message}`)).toEqual([
      'practice[0].groups[1].lessonIds[0]: lesson "b1.phrasal-verbs.practice-travel-2" is already in group "practice.phrasal-verbs.travel"',
      'practice[0].groups[1].lessonIds[1]: lesson "b1.phrasal-verbs.practice-travel-1" is already in group "practice.phrasal-verbs.travel"',
    ]);
  });

  it("never practices a path item, so practice cannot change path progress", () => {
    const [, group] = fx.practiceFiles() as [LoadedFile, LoadedFile];
    const exercises = (group.data.exercises ?? []).map((e, i) =>
      i === 0 ? { ...e, itemIds: [...e.itemIds, "b1.travel.although"] } : e,
    );
    const errors = validatePracticeLessons([PATH_FILE, ...practice({ group: { exercises } })]);
    expect(errors).toEqual([
      {
        file: GROUP_FILE,
        path: "lessons[0]",
        message:
          'practice lesson "b1.phrasal-verbs.practice-travel-1" practices "b1.travel.although", an item of the learning path; practice must never change path progress',
      },
    ]);
  });

  it("never repeats a path item under another id", () => {
    const items = [
      fx.item({
        id: "b1.phrasal-verbs.go-out",
        topics: ["phrasal-verbs"],
        kind: "phrase",
        term: "Although (something)",
      }),
    ];
    const errors = validatePracticeLessons([PATH_FILE, ...practice({ group: { items } })]);
    expect(errors).toEqual([
      {
        file: GROUP_FILE,
        path: "items[0].term",
        message:
          'practice item "b1.phrasal-verbs.go-out" repeats "b1.travel.although", an item of the learning path',
      },
    ]);
  });

  it("keeps lesson ids apart from card ids (their results share one namespace)", () => {
    const lessons: Lesson[] = [
      fx.practiceLesson(1, { id: "b1.grammar.although" }),
      fx.practiceLesson(2),
    ];
    const errors = validatePracticeLessons([
      fx.cardFile(),
      ...practice({ group: { lessons } }),
    ]).filter((e) => e.message.includes("card"));
    expect(errors).toEqual([
      {
        file: GROUP_FILE,
        path: "lessons[0].id",
        message: 'lesson id "b1.grammar.although" is also a card id; lesson results are kept by id',
      },
    ]);
  });
});

describe("validateTopicDeepenCards and practice lessons", () => {
  it("lets every practice lesson link the cards it practices", () => {
    const deepenCardIds = ["b1.grammar.although"];
    const lessons = [
      fx.practiceLesson(1, { deepenCardIds }),
      fx.practiceLesson(2, { deepenCardIds }),
    ];
    expect(validateTopicDeepenCards(practice({ group: { lessons } }))).toEqual([]);
  });
});
