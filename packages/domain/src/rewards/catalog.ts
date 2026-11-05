/**
 * Avi's wardrobe: what there is to wear, where it goes and what it costs (section 2.2 of
 * `docs/design/avi-rewards.md`). Pure data for the app; the fold never reads it (a purchase
 * carries its price, so a later price change never rewrites a balance).
 */

/** Where an item goes on Avi; one item per slot. `paper` is Avi's body colour. */
export const WARDROBE_SLOTS = ["head", "neck", "eyes", "paper", "sticker"] as const;

export type WardrobeSlot = (typeof WARDROBE_SLOTS)[number];

type ItemBase = {
  /** Stable id written in `item_purchased` / `item_equipped` (kebab-case, never reused). */
  readonly id: string;
  readonly slot: WardrobeSlot;
  /** UI name, neutral Spanish ("Gorro de lana"). */
  readonly name: string;
  /** The name's definite article, for copy like "¿Comprar el gorro de lana…?". */
  readonly article: "el" | "la" | "las";
};

/** Sold in the wardrobe for `price` plumas. */
export type ShopItem = ItemBase & { readonly price: number };

/** Never sold: won with an album badge (slice 4 of the design unlocks these). */
export type BadgeItem = ItemBase & { readonly badgeId: string };

export type WardrobeItem = ShopItem | BadgeItem;

export function isShopItem(item: WardrobeItem): item is ShopItem {
  return "price" in item;
}

export const WARDROBE_CATALOG: readonly WardrobeItem[] = [
  { id: "gorra", slot: "head", name: "Gorra", article: "la", price: 80 },
  { id: "gorro-de-lana", slot: "head", name: "Gorro de lana", article: "el", price: 120 },
  { id: "sombrero-de-paja", slot: "head", name: "Sombrero de paja", article: "el", price: 160 },
  { id: "corona-de-papel", slot: "head", name: "Corona de papel", article: "la", price: 250 },
  { id: "birrete", slot: "head", name: "Birrete", article: "el", badgeId: "level-a2" },
  { id: "panuelo", slot: "neck", name: "Pañuelo", article: "el", price: 60 },
  { id: "mono", slot: "neck", name: "Moño", article: "el", price: 100 },
  { id: "bufanda-de-rayas", slot: "neck", name: "Bufanda de rayas", article: "la", price: 160 },
  { id: "bufanda-b1", slot: "neck", name: "Bufanda B1", article: "la", badgeId: "level-b1" },
  { id: "gafas-redondas", slot: "eyes", name: "Gafas redondas", article: "las", price: 80 },
  { id: "gafas-de-sol", slot: "eyes", name: "Gafas de sol", article: "las", price: 120 },
  { id: "gafas-de-aviador", slot: "eyes", name: "Gafas de aviador", article: "las", price: 200 },
  {
    id: "gafas-de-lectura",
    slot: "eyes",
    name: "Gafas de lectura",
    article: "las",
    badgeId: "grammar-level",
  },
  { id: "papel-cielo", slot: "paper", name: "Papel cielo", article: "el", price: 50 },
  { id: "papel-menta", slot: "paper", name: "Papel menta", article: "el", price: 50 },
  {
    id: "papel-cuadriculado",
    slot: "paper",
    name: "Papel cuadriculado",
    article: "el",
    price: 180,
  },
  {
    id: "papel-holografico",
    slot: "paper",
    name: "Papel holográfico",
    article: "el",
    badgeId: "streak-30",
  },
  { id: "estrella", slot: "sticker", name: "Estrella", article: "la", price: 40 },
  { id: "corazon", slot: "sticker", name: "Corazón", article: "el", price: 40 },
  { id: "rayo", slot: "sticker", name: "Rayo", article: "el", price: 40 },
];

const BY_ID: ReadonlyMap<string, WardrobeItem> = new Map(
  WARDROBE_CATALOG.map((item) => [item.id, item]),
);

/** The item with `id`, or `undefined` for an id this app version does not know. */
export function catalogItem(id: string): WardrobeItem | undefined {
  return BY_ID.get(id);
}

/** What Avi visibly wears: an item id per slot. */
export type Outfit = Readonly<Partial<Record<WardrobeSlot, string>>>;

/**
 * The visible outfit (section 3.2 of the design): per slot, the equipped item when this app
 * knows it, it belongs to that slot and the learner has it (`unlocked`: bought, and in slice 4
 * the badge prizes won). Anything else is hidden, never an error, so newer catalogues survive.
 */
export function resolveOutfit(
  equipped: Readonly<Record<string, string | null>>,
  unlocked: ReadonlySet<string>,
): Outfit {
  const outfit: Partial<Record<WardrobeSlot, string>> = {};
  for (const slot of WARDROBE_SLOTS) {
    const id = equipped[slot];
    if (id === null || id === undefined) continue;
    const item = catalogItem(id);
    if (item?.slot === slot && unlocked.has(id)) outfit[slot] = id;
  }
  return outfit;
}
