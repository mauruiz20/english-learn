import type { Item } from "@english-learn/content";
import type { ItemOutcome } from "./lesson-session";
import { itemsToReview } from "./items-to-review";

const item = (id: string, term: string, es: string): Item => ({
  id,
  level: "A2",
  topics: ["routine"],
  kind: "word",
  term,
  es,
});

const itemsById = new Map(
  [
    item("wake-up", "wake up", "despertarse"),
    item("breakfast", "have breakfast", "desayunar"),
    item("usually", "usually", "normalmente"),
    item("bed", "go to bed", "acostarse"),
  ].map((i) => [i.id, i]),
);

const outcome = (itemId: string, verdict: ItemOutcome["verdict"]): ItemOutcome => ({
  itemId,
  exerciseType: "vocab",
  verdict,
  responseMs: 1000,
});

describe("itemsToReview", () => {
  it("lists the items answered wrong or almost, in session order, with their gloss", () => {
    const outcomes = [
      outcome("wake-up", "correct"),
      outcome("breakfast", "wrong"),
      outcome("usually", "almost"),
      outcome("bed", "correct"),
    ];

    expect(itemsToReview(outcomes, itemsById)).toEqual([
      { id: "breakfast", term: "have breakfast", es: "desayunar", topic: undefined },
      { id: "usually", term: "usually", es: "normalmente", topic: undefined },
    ]);
  });

  it("lists an item once, even if it was missed again or got right later", () => {
    const outcomes = [
      outcome("breakfast", "wrong"),
      outcome("breakfast", "correct"),
      outcome("breakfast", "almost"),
    ];

    expect(itemsToReview(outcomes, itemsById).map((i) => i.id)).toEqual(["breakfast"]);
  });

  it("is empty when everything was correct", () => {
    expect(itemsToReview([outcome("wake-up", "correct")], itemsById)).toEqual([]);
  });

  it("skips items missing from the corpus and stops at the limit", () => {
    const outcomes = ["ghost", "wake-up", "breakfast", "usually", "bed"].map((id) =>
      outcome(id, "wrong"),
    );

    expect(itemsToReview(outcomes, itemsById, { limit: 3 }).map((i) => i.id)).toEqual([
      "wake-up",
      "breakfast",
      "usually",
    ]);
  });

  it("tags each item with the topic of its lesson, when known", () => {
    const topics = new Map([["breakfast", "food"]]);
    const outcomes = [outcome("breakfast", "wrong"), outcome("usually", "wrong")];

    expect(itemsToReview(outcomes, itemsById, { topics }).map((i) => i.topic)).toEqual([
      "food",
      undefined,
    ]);
  });

  it("shows at most six items by default", () => {
    const many = new Map(
      Array.from({ length: 9 }, (_, i) => item(`i${i}`, `term ${i}`, `es ${i}`)).map((i) => [
        i.id,
        i,
      ]),
    );
    const outcomes = [...many.keys()].map((id) => outcome(id, "wrong"));

    expect(itemsToReview(outcomes, many)).toHaveLength(6);
  });
});
