import { describe, expect, it } from "vitest";
import { MAX_ITEM_ID_LENGTH, MAX_ITEM_PRICE, MAX_SLOT_LENGTH } from "../progress-log/events";
import {
  WARDROBE_CATALOG,
  WARDROBE_SLOTS,
  catalogItem,
  isShopItem,
  resolveOutfit,
  type WardrobeItem,
} from "./catalog";

/** Section 2.2 of docs/design/avi-rewards.md: slot, UI name and price (null: a badge prize). */
const DESIGN: readonly [string, string, number | null][] = [
  ["head", "Gorra", 80],
  ["head", "Gorro de lana", 120],
  ["head", "Sombrero de paja", 160],
  ["head", "Corona de papel", 250],
  ["head", "Birrete", null],
  ["neck", "Pañuelo", 60],
  ["neck", "Moño", 100],
  ["neck", "Bufanda de rayas", 160],
  ["neck", "Bufanda B1", null],
  ["eyes", "Gafas redondas", 80],
  ["eyes", "Gafas de sol", 120],
  ["eyes", "Gafas de aviador", 200],
  ["eyes", "Gafas de lectura", null],
  ["paper", "Papel cielo", 50],
  ["paper", "Papel menta", 50],
  ["paper", "Papel cuadriculado", 180],
  ["paper", "Papel holográfico", null],
  ["sticker", "Estrella", 40],
  ["sticker", "Corazón", 40],
  ["sticker", "Rayo", 40],
];

const price = (item: WardrobeItem) => (isShopItem(item) ? item.price : null);

describe("the wardrobe catalogue", () => {
  it("is the design's 20 items, with their slots and prices", () => {
    expect(WARDROBE_CATALOG.map((item) => [item.slot, item.name, price(item)])).toEqual(DESIGN);
  });

  it("sells 16 items for 1,730 plumas, the cheapest at 40", () => {
    const shop = WARDROBE_CATALOG.filter(isShopItem);
    expect(shop).toHaveLength(16);
    expect(shop.reduce((sum, item) => sum + item.price, 0)).toBe(1730);
    expect(Math.min(...shop.map((item) => item.price))).toBe(40);
  });

  it("has unique ids that a purchase or equip event accepts", () => {
    const ids = WARDROBE_CATALOG.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(id.length).toBeLessThanOrEqual(MAX_ITEM_ID_LENGTH);
    }
  });

  it("uses only the five slots, each a valid event slot, each with something for sale", () => {
    expect(WARDROBE_SLOTS).toEqual(["head", "neck", "eyes", "paper", "sticker"]);
    for (const slot of WARDROBE_SLOTS) {
      expect(slot).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(slot.length).toBeLessThanOrEqual(MAX_SLOT_LENGTH);
      expect(WARDROBE_CATALOG.some((item) => item.slot === slot && isShopItem(item))).toBe(true);
    }
  });

  it("prices whole plumas within what an event carries, and badge prizes are never for sale", () => {
    for (const item of WARDROBE_CATALOG) {
      if (isShopItem(item)) {
        expect(Number.isInteger(item.price)).toBe(true);
        expect(item.price).toBeGreaterThanOrEqual(1);
        expect(item.price).toBeLessThanOrEqual(MAX_ITEM_PRICE);
      } else {
        expect(item.badgeId).toMatch(/^[a-z0-9-]+$/);
      }
    }
    expect(
      Object.fromEntries(
        WARDROBE_CATALOG.flatMap((item) => (isShopItem(item) ? [] : [[item.id, item.badgeId]])),
      ),
    ).toEqual({
      birrete: "level-a2",
      "bufanda-b1": "level-b1",
      "gafas-de-lectura": "grammar-level",
      "papel-holografico": "streak-30",
    });
  });

  it("finds an item by id, and nothing for an id this version does not know", () => {
    expect(catalogItem("gorro-de-lana")?.name).toBe("Gorro de lana");
    expect(catalogItem("capa-de-mago")).toBeUndefined();
  });
});

describe("resolveOutfit", () => {
  it("wears the equipped items the learner owns, slot by slot", () => {
    expect(
      resolveOutfit({ head: "gorra", sticker: "rayo" }, new Set(["gorra", "rayo", "panuelo"])),
    ).toEqual({ head: "gorra", sticker: "rayo" });
  });

  it("drops an item taken off, not owned, unknown, or worn in another slot", () => {
    expect(
      resolveOutfit(
        {
          head: null,
          neck: "panuelo",
          eyes: "monoculo",
          paper: "gafas-de-sol",
          cape: "capa",
        },
        new Set(["gafas-de-sol", "monoculo", "capa"]),
      ),
    ).toEqual({});
  });

  it("is empty for a learner with nothing equipped", () => {
    expect(resolveOutfit({}, new Set())).toEqual({});
  });
});
