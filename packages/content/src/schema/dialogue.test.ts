import { describe, expect, it } from "vitest";
import * as fx from "../testing/fixtures";
import { ContentFileSchema } from "./content-file";
import { DialogueSchema, type Dialogue } from "./dialogue";
import { PracticeCollectionSchema } from "./practice";

const ok = (value: unknown) => DialogueSchema.safeParse(value).success;

/** `fx.dialogue()` with the node `id` replaced by `patch` merged into it. */
function withNode(id: string, patch: object): Dialogue {
  const d = fx.dialogue();
  return { ...d, nodes: d.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) } as Dialogue;
}

describe("DialogueSchema", () => {
  it("accepts a dialogue with NPC lines, choose and write turns and endings", () => {
    expect(ok(fx.dialogue())).toBe(true);
  });

  it("is a content file key", () => {
    expect(ContentFileSchema.safeParse({ dialogues: [fx.dialogue()] }).success).toBe(true);
  });

  it("takes a content id, a CEFR level and Spanish title and setting", () => {
    expect(ok({ ...fx.dialogue(), id: "dialogues.trip" })).toBe(false);
    expect(ok({ ...fx.dialogue(), level: "B3" })).toBe(false);
    expect(ok({ ...fx.dialogue(), title: "" })).toBe(false);
    expect(ok({ ...fx.dialogue(), setting: " Ana" })).toBe(false);
    expect(ok({ ...fx.dialogue(), extra: 1 })).toBe(false);
  });

  it("needs 1 to 3 characters with an id, a name and a role", () => {
    const ana = fx.dialogue().characters[0];
    expect(ok({ ...fx.dialogue(), characters: [] })).toBe(false);
    expect(ok({ ...fx.dialogue(), characters: Array(4).fill(ana) })).toBe(false);
    expect(ok({ ...fx.dialogue(), characters: [{ ...ana, role: "" }] })).toBe(false);
  });

  it("takes node ids made of lowercase letters, digits and hyphens", () => {
    expect(ok(withNode("n1", { id: "N 1" }))).toBe(false);
    expect(ok({ ...fx.dialogue(), start: "" })).toBe(false);
  });

  it("gives an NPC line its English, its Spanish gloss and the next node", () => {
    expect(ok(withNode("n1", { es: "" }))).toBe(false);
    expect(ok(withNode("n1", { next: undefined }))).toBe(false);
  });

  it("gives a choose turn 2 to 4 replies rated good, ok or wrong, with Spanish feedback", () => {
    const t1 = fx.dialogue().nodes[1];
    if (t1?.kind !== "choose") throw new Error("t1 is a choose turn");
    const [good] = t1.options;
    expect(ok(withNode("t1", { options: [good] }))).toBe(false);
    expect(ok(withNode("t1", { options: Array(5).fill(good) }))).toBe(false);
    expect(ok(withNode("t1", { options: [good, { ...good, rating: "great" }] }))).toBe(false);
    expect(ok(withNode("t1", { options: [good, { ...good, feedback: "" }] }))).toBe(false);
  });

  it("gives a write turn a Spanish prompt and at least one accepted pattern", () => {
    expect(ok(withNode("t2", { accepted: [] }))).toBe(false);
    expect(ok(withNode("t2", { prompt: "" }))).toBe(false);
    expect(ok(withNode("t2", { wrongNext: undefined }))).toBe(true);
  });

  it("lets a learner turn list the items it practices and the dialogue link 1-3 cards", () => {
    expect(ok(withNode("t2", { itemIds: ["b1.phrasal-verbs.go-out"] }))).toBe(true);
    expect(ok(withNode("t2", { itemIds: [] }))).toBe(false);
    expect(ok({ ...fx.dialogue(), cardIds: ["b1.grammar.although"] })).toBe(true);
    expect(ok({ ...fx.dialogue(), cardIds: [] })).toBe(false);
  });

  it("rejects unknown node kinds", () => {
    expect(ok(withNode("end", { kind: "narrator" }))).toBe(false);
  });
});

describe("practice groups of dialogues", () => {
  it("lists 1 to 6 dialogues instead of lessons", () => {
    const parse = (dialogueIds: string[]) =>
      PracticeCollectionSchema.safeParse(fx.dialogueCollection(dialogueIds)).success;
    expect(parse([fx.DIALOGUE_ID])).toBe(true);
    expect(parse([])).toBe(false);
    expect(parse(Array(7).fill(fx.DIALOGUE_ID))).toBe(false);
  });

  it("never lists both lessons and dialogues", () => {
    const collection = fx.dialogueCollection();
    const [group] = collection.groups;
    const both = { ...group, lessonIds: ["b1.phrasal-verbs.a", "b1.phrasal-verbs.b"] };
    expect(PracticeCollectionSchema.safeParse({ ...collection, groups: [both] }).success).toBe(
      false,
    );
  });
});
