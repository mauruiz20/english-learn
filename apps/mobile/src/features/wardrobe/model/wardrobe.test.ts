import { EMPTY_REWARDS, catalogItem, type Rewards, type WardrobeItem } from "@english-learn/domain";
import {
  SLOT_TABS,
  itemAction,
  itemLabel,
  itemState,
  itemStatusText,
  purchaseDone,
  purchaseQuestion,
  trialOutfit,
  wardrobeFromRewards,
} from "./wardrobe";

const item = (id: string): WardrobeItem => {
  const found = catalogItem(id);
  if (found === undefined) throw new Error(id);
  return found;
};

const rewards = (overrides: Partial<Rewards>): Rewards => ({ ...EMPTY_REWARDS, ...overrides });

describe("the wardrobe model", () => {
  it("wears what the learner equipped and owns, and nothing else", () => {
    const wardrobe = wardrobeFromRewards(
      rewards({
        balance: 30,
        ownedItemIds: ["gorra", "rayo"],
        equipped: { head: "gorra", neck: "panuelo", sticker: null },
      }),
    );

    expect(wardrobe.balance).toBe(30);
    expect([...wardrobe.owned]).toEqual(["gorra", "rayo"]);
    expect(wardrobe.outfit).toEqual({ head: "gorra" });
  });

  it("tells each item's state: for sale, owned, worn or a badge prize", () => {
    const wardrobe = wardrobeFromRewards(
      rewards({ ownedItemIds: ["gorra", "rayo"], equipped: { head: "gorra" } }),
    );

    expect(itemState(item("gorra"), wardrobe)).toBe("worn");
    expect(itemState(item("rayo"), wardrobe)).toBe("owned");
    expect(itemState(item("corazon"), wardrobe)).toBe("for-sale");
    expect(itemState(item("birrete"), wardrobe)).toBe("locked");
  });

  it("labels every item for screen readers", () => {
    const wardrobe = wardrobeFromRewards(
      rewards({ ownedItemIds: ["gorra", "rayo"], equipped: { head: "gorra" } }),
    );

    expect(itemLabel(item("gorro-de-lana"), wardrobe)).toBe("Gorro de lana, 120 plumas");
    expect(itemLabel(item("rayo"), wardrobe)).toBe("Rayo, 40 plumas, comprado");
    expect(itemLabel(item("gorra"), wardrobe)).toBe("Gorra, 80 plumas, comprado, puesto");
    expect(itemLabel(item("bufanda-b1"), wardrobe)).toBe(
      "Bufanda B1, se gana con la insignia Nivel B1 completo",
    );
  });

  it("shows one status on each card", () => {
    expect(itemStatusText(item("gorra"), "for-sale")).toBe("80 plumas");
    expect(itemStatusText(item("gorra"), "owned")).toBe("En tu armario");
    expect(itemStatusText(item("gorra"), "worn")).toBe("En uso");
    expect(itemStatusText(item("birrete"), "locked")).toBe("Con insignia");
  });

  describe("the action for the item being tried on", () => {
    it("offers to buy an item the balance covers, exactly or more", () => {
      expect(itemAction(item("estrella"), wardrobeFromRewards(rewards({ balance: 40 })))).toEqual({
        kind: "buy",
        price: 40,
      });
      expect(itemAction(item("gorra"), wardrobeFromRewards(rewards({ balance: 135 })))).toEqual({
        kind: "buy",
        price: 80,
      });
    });

    it("says how many plumas are missing when the balance is not enough", () => {
      const short = itemAction(
        item("gorro-de-lana"),
        wardrobeFromRewards(rewards({ balance: 100 })),
      );
      expect(short).toEqual({ kind: "short", missing: 20, text: "Te faltan 20 plumas" });
      expect(
        itemAction(item("estrella"), wardrobeFromRewards(rewards({ balance: 39 }))),
      ).toMatchObject({ text: "Te falta 1 pluma" });
    });

    it("counts a debt in what is missing (a negative balance after offline purchases)", () => {
      expect(itemAction(item("estrella"), wardrobeFromRewards(rewards({ balance: -30 })))).toEqual({
        kind: "short",
        missing: 70,
        text: "Te faltan 70 plumas",
      });
    });

    it("lets the learner wear and take off what they own, whatever the balance", () => {
      const inDebt = wardrobeFromRewards(
        rewards({ balance: -30, ownedItemIds: ["gorra", "rayo"], equipped: { head: "gorra" } }),
      );
      expect(itemAction(item("rayo"), inDebt)).toEqual({ kind: "wear" });
      expect(itemAction(item("gorra"), inDebt)).toEqual({ kind: "take-off" });
    });

    it("never sells a badge prize", () => {
      expect(
        itemAction(item("gafas-de-lectura"), wardrobeFromRewards(rewards({ balance: 9999 }))),
      ).toEqual({ kind: "locked", text: "Se gana con la insignia Gramática al día" });
    });
  });

  it("tries an item on over the outfit, in its own slot", () => {
    expect(trialOutfit({ head: "gorra", sticker: "rayo" }, item("estrella"))).toEqual({
      head: "gorra",
      sticker: "estrella",
    });
    expect(trialOutfit({ head: "gorra" }, null)).toEqual({ head: "gorra" });
  });

  it("asks before buying, and says what Avi got", () => {
    expect(purchaseQuestion(item("gorro-de-lana"))).toBe(
      "¿Comprar el gorro de lana por 120 plumas?",
    );
    expect(purchaseQuestion(item("gafas-de-sol"))).toBe(
      "¿Comprar las gafas de sol por 120 plumas?",
    );
    expect(purchaseDone(item("gorro-de-lana"))).toBe("¡Listo! Avi ya tiene su gorro de lana.");
    expect(purchaseDone(item("gafas-de-sol"))).toBe("¡Listo! Avi ya tiene sus gafas de sol.");
    expect(purchaseDone(item("bufanda-b1"))).toBe("¡Listo! Avi ya tiene su bufanda B1.");
  });

  it("has a tab per slot, in the catalogue's order", () => {
    expect(SLOT_TABS.map((tab) => [tab.slot, tab.label])).toEqual([
      ["head", "Gorros"],
      ["neck", "Cuello"],
      ["eyes", "Gafas"],
      ["paper", "Papel"],
      ["sticker", "Stickers"],
    ]);
  });
});
