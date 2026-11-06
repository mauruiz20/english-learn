import { describe, expect, it } from "vitest";
import type { Dialogue, DialogueNode } from "../schema";
import * as fx from "../testing/fixtures";
import {
  findUncoveredWords,
  validateCorpus,
  validateDialogueReferences,
  validateDialogues,
  validateLayout,
  validateNeutralSpanish,
  validatePracticeCollections,
  validateUniqueIds,
  type LoadedFile,
} from "./index";

const FILE = "practice/dialogues/trip.json";
const COLLECTION = "practice/dialogues/collection.json";
const PATH_FILE: LoadedFile = { file: "b1/travel.json", data: fx.validFile() };

const file = (d: Dialogue): LoadedFile => ({ file: FILE, data: { dialogues: [d] } });

/** `fx.dialogue()` with each node in `patches` merged into the node of that id. */
function patched(patches: Record<string, object>, o: Partial<Dialogue> = {}): Dialogue {
  const d = fx.dialogue(o);
  return {
    ...d,
    nodes: d.nodes.map((n) => (n.id in patches ? { ...n, ...patches[n.id] } : n)) as DialogueNode[],
  };
}

/** `fx.dialogue()` without the nodes `ids`, plus `extra` nodes. */
function withNodes(remove: string[], extra: DialogueNode[] = []): Dialogue {
  const d = fx.dialogue();
  return { ...d, nodes: [...d.nodes.filter((n) => !remove.includes(n.id)), ...extra] };
}

const messages = (d: Dialogue) =>
  validateDialogues([file(d)]).map((e) => `${e.path}: ${e.message}`);

describe("dialogue content", () => {
  it("passes every rule next to the path's content and the other practice", () => {
    const files = [PATH_FILE, ...fx.practiceFiles(), ...fx.dialogueFiles(), ...fx.glossaryFiles()];
    expect(validateCorpus(files)).toEqual([]);
  });
});

describe("validateDialogues (the graph)", () => {
  it("passes for the fixture", () => {
    expect(messages(fx.dialogue())).toEqual([]);
  });

  it("names dialogues <level>.dialogues.<slug>", () => {
    expect(messages(fx.dialogue({ id: "b1.travel.trip" }))).toEqual([
      'dialogues[0].id: dialogue id "b1.travel.trip" must look like <level>.dialogues.<slug>',
    ]);
  });

  it("keeps node and character ids unique", () => {
    const ana = fx.dialogue().characters[0]!;
    const d = withNodes([], [{ id: "end", kind: "end", text: "Otra vez." }]);
    expect(messages({ ...d, characters: [ana, ana] })).toEqual([
      'dialogues[0].characters[1].id: duplicate character id "ana"',
      'dialogues[0].nodes[15].id: duplicate node id "end"',
    ]);
  });

  it("resolves the start, every speaker and every next node (no dead ends)", () => {
    const d = patched(
      { n1: { speaker: "bob" }, t2: { wrongNext: "nowhere" }, t5: { options: [] } },
      { start: "begin" },
    );
    const t5 = d.nodes.find((n) => n.id === "t5");
    if (t5?.kind === "choose") {
      t5.options.push(
        { en: "It rained.", rating: "good", feedback: "Bien.", next: "end" },
        { en: "Paris.", rating: "wrong", feedback: "No.", next: "the-end" },
      );
    }
    expect(messages(d)).toEqual([
      'dialogues[0].start: unknown start node "begin"',
      'dialogues[0].nodes[0].speaker: unknown character "bob"',
      'dialogues[0].nodes[4].wrongNext: dead end: "nowhere" is not a node',
      'dialogues[0].nodes[12].options[1].next: dead end: "the-end" is not a node',
    ]);
  });

  it("reaches every node from the start", () => {
    const d = withNodes([], [{ id: "lost", kind: "end", text: "Nadie llega aquí." }]);
    expect(messages(d)).toEqual([
      'dialogues[0].nodes[15]: node "lost" is unreachable from the start',
    ]);
  });

  it("ends every path: no cycles", () => {
    expect(messages(patched({ n5: { next: "n1" } }))).toEqual([
      "dialogues[0]: the path n1 → t1 → n2 → t2 → n3 → t3 → n4b → t4 → n5 → n1 loops; every path must reach an end",
      'dialogues[0].nodes[12]: node "t5" is unreachable from the start',
      'dialogues[0].nodes[13]: node "end" is unreachable from the start',
      'dialogues[0].nodes[14]: node "end-b" is unreachable from the start',
    ]);
  });

  it("offers a good reply on every choose turn, and an all-good path to an end", () => {
    const options = [
      { en: "Paris.", rating: "ok", feedback: "Raro.", next: "end" },
      { en: "Madrid.", rating: "wrong", feedback: "No.", next: "end-b" },
    ];
    expect(messages(patched({ t5: { options } }))).toEqual([
      "dialogues[0].nodes[12].options: a choose turn needs at least one good reply",
      "dialogues[0]: no path reaches an end with good replies only",
    ]);
  });

  it("never repeats a reply in a turn", () => {
    const options = [
      { en: "It rained.", rating: "good", feedback: "Bien.", next: "end" },
      { en: "it rained", rating: "wrong", feedback: "No.", next: "end-b" },
    ];
    expect(messages(patched({ t5: { options } }))).toEqual([
      'dialogues[0].nodes[12].options[1].en: duplicate reply "it rained" (normalized)',
    ]);
  });

  it("asks for the same number of learner turns, 5 to 8, on every path", () => {
    // A wrong first reply skips turn t2: that path has one turn less.
    expect(messages(patched({ n2b: { next: "n3" } }))).toEqual([
      "dialogues[0]: every path needs the same number of learner turns; paths have 4 or 5",
    ]);
    // Without t4 every path has 4 turns.
    const short = patched({ n4: { next: "n5" }, n4b: { next: "n5" } });
    expect(messages({ ...short, nodes: short.nodes.filter((n) => n.id !== "t4") })).toEqual([
      "dialogues[0]: every path needs 5 to 8 learner turns, not 4",
    ]);
  });

  it("mixes choose and write turns", () => {
    const d = patched({
      t2: {
        kind: "choose",
        prompt: undefined,
        accepted: undefined,
        wrongNext: undefined,
        next: undefined,
        options: [
          { en: "It was a short trip.", rating: "good", feedback: "Bien.", next: "n3" },
          { en: "Paris.", rating: "wrong", feedback: "No.", next: "n3b" },
        ],
      },
      t4: {
        kind: "choose",
        prompt: undefined,
        accepted: undefined,
        tip: undefined,
        next: undefined,
        options: [
          { en: "He was tired.", rating: "good", feedback: "Bien.", next: "n5" },
          { en: "Lisbon.", rating: "wrong", feedback: "No.", next: "n5" },
        ],
      },
    });
    expect(messages(d)).toEqual(["dialogues[0]: a dialogue needs both choose and write turns"]);
  });

  it("branches at least twice: replies lead to different reactions", () => {
    // Every reply leads to the same node except at t1.
    const linear = patched({
      t2: { wrongNext: undefined },
      t3: {
        options: [
          { en: "Madrid.", rating: "wrong", feedback: "No.", next: "n4" },
          { en: "They went out.", rating: "good", feedback: "Bien.", next: "n4" },
        ],
      },
      t5: {
        options: [
          { en: "It rained.", rating: "good", feedback: "Bien.", next: "end" },
          { en: "Paris.", rating: "wrong", feedback: "No.", next: "end" },
        ],
      },
    });
    expect(
      messages({
        ...linear,
        nodes: linear.nodes.filter((n) => !["n3b", "n4b", "end-b"].includes(n.id)),
      }),
    ).toEqual([
      "dialogues[0]: replies lead to different nodes in only 1 turn; at least 2 must branch",
    ]);
  });

  it("checks write answer patterns", () => {
    const accepted = ["It was {short|", "It was a [very ]short trip.", "it was a short trip"];
    expect(messages(patched({ t2: { accepted } }))).toEqual([
      'dialogues[0].nodes[4].accepted[0]: invalid answer pattern: unclosed group: missing "}"',
      'dialogues[0].nodes[4].accepted[2]: duplicate accepted sentence "it was a short trip" (normalized), also from accepted[1]',
    ]);
  });
});

describe("dialogue layout, ids and Spanish", () => {
  it("keeps dialogues in practice/<collection>/, with their level in the id", () => {
    const errors = validateLayout([
      { file: "b1/trip.json", data: { dialogues: [fx.dialogue()] } },
      { file: FILE, data: { dialogues: [fx.dialogue({ level: "B2" })] } },
    ]);
    expect(errors).toEqual([
      {
        file: "b1/trip.json",
        path: "dialogues[0]",
        message: "dialogues belong in practice/<collection>/, not b1/",
      },
      {
        file: FILE,
        path: "dialogues[0].id",
        message: 'id "b1.dialogues.trip" does not start with its level "b2."',
      },
    ]);
  });

  it("keeps dialogue ids unique", () => {
    const errors = validateUniqueIds([file(fx.dialogue()), file(fx.dialogue())]);
    expect(errors.map((e) => e.message)).toEqual([
      `duplicate dialogues id "${fx.DIALOGUE_ID}" (first defined at ${FILE} dialogues[0])`,
    ]);
  });

  it("speaks neutral Spanish in every text", () => {
    const errors = validateNeutralSpanish([
      file(patched({ n1: { es: "¿Adónde fueron? Contame." } })),
    ]);
    expect(errors.map((e) => e.path)).toEqual(["dialogues[0].nodes[0].es"]);
  });

  it("covers every English line, reply and accepted sentence with the glossary", () => {
    const d = patched({
      n1: { en: "Hello, where did they go?" },
      t2: { accepted: ["It was a {short|tiny} trip."] },
    });
    const words = findUncoveredWords([file(d), ...fx.glossaryFiles()]).map(
      (w) => `${w.path}: ${w.word}`,
    );
    expect(words).toEqual([
      "dialogues[0].nodes[0].en: Hello",
      "dialogues[0].nodes[4].accepted[0]: tiny",
    ]);
  });
});

describe("validateDialogueReferences", () => {
  const all = (d: Dialogue = fx.dialogue(), extra: LoadedFile[] = []) => [
    PATH_FILE,
    fx.cardFile(),
    ...fx.practiceFiles(),
    ...fx.dialogueFiles(d),
    ...extra,
  ];

  it("passes for the fixture", () => {
    expect(validateDialogueReferences(all())).toEqual([]);
  });

  it("resolves turn items and linked cards, at or below the dialogue level", () => {
    const d = patched(
      { t3: { itemIds: ["b1.phrasal-verbs.missing"] }, t2: { itemIds: ["b2.travel.x"] } },
      { cardIds: ["b1.grammar.nope"] },
    );
    const b2Item = fx.item({ id: "b2.travel.x", level: "B2", term: "x-ray" });
    const errors = validateDialogueReferences(
      all(d, [{ file: "b2/travel.json", data: { items: [b2Item] } }]),
    );
    expect(errors.map((e) => `${e.path}: ${e.message}`)).toEqual([
      'dialogues[0].cardIds[0]: unknown card id "b1.grammar.nope"',
      'dialogues[0].nodes[4].itemIds[0]: item "b2.travel.x" is B2, above the dialogue (B1)',
      'dialogues[0].nodes[7].itemIds[0]: unknown item id "b1.phrasal-verbs.missing"',
    ]);
  });

  it("never practices an item of the learning path", () => {
    const d = patched({ t3: { itemIds: ["b1.travel.although"] } });
    expect(validateDialogueReferences(all(d)).map((e) => e.message)).toEqual([
      'dialogue "b1.dialogues.trip" practices "b1.travel.although", an item of the learning path; practice must never change path progress',
    ]);
  });

  it("keeps dialogue ids apart from lesson and card ids (results share one namespace)", () => {
    const d = fx.dialogue({ id: "b1.grammar.although" });
    const messages = validateDialogueReferences(all(d)).map((e) => e.message);
    expect(messages).toContain(
      'dialogue id "b1.grammar.although" is also a card id; results are kept by id',
    );
  });

  it("lists every dialogue in exactly one group of its collection, at the group level", () => {
    const other = fx.dialogue({ id: "b1.dialogues.other" });
    const extraFile = { file: "practice/dialogues/other.json", data: { dialogues: [other] } };
    const [collection] = fx.dialogueFiles();
    const groups = [
      {
        ...fx.dialogueCollection().groups[0]!,
        level: "B2",
        dialogueIds: [fx.DIALOGUE_ID, "b1.dialogues.gone"],
      },
    ];
    const patchedCollection = {
      ...collection!,
      data: { practice: [{ ...fx.dialogueCollection(), groups }] },
    } as LoadedFile;
    const errors = validateDialogueReferences([
      PATH_FILE,
      ...fx.practiceFiles(),
      patchedCollection,
      file(fx.dialogue()),
      extraFile,
    ]);
    expect(errors.map((e) => `${e.file} ${e.path}: ${e.message}`)).toEqual([
      `${COLLECTION} practice[0].groups[0].dialogueIds[0]: dialogue "${fx.DIALOGUE_ID}" is B1 but the group is B2`,
      `${COLLECTION} practice[0].groups[0].dialogueIds[1]: unknown dialogue id "b1.dialogues.gone"`,
      'practice/dialogues/other.json dialogues[0]: dialogue "b1.dialogues.other" is in no group',
    ]);
  });

  it("never repeats a dialogue in a group", () => {
    const files = [
      {
        file: COLLECTION,
        data: { practice: [fx.dialogueCollection([fx.DIALOGUE_ID, fx.DIALOGUE_ID])] },
      },
    ];
    expect(validatePracticeCollections(files).map((e) => e.message)).toEqual([
      `duplicate dialogue id "${fx.DIALOGUE_ID}"`,
    ]);
  });
});
