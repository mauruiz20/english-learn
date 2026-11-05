import {
  WARDROBE_SLOTS,
  isShopItem,
  resolveOutfit,
  type Outfit,
  type Rewards,
  type WardrobeItem,
  type WardrobeSlot,
} from "@english-learn/domain";
import { ACHIEVEMENTS } from "@/features/achievements/model/achievements";
import { formatPlumas } from "@/features/rewards/model/plumas-copy";

/** What the wardrobe needs from the learner's rewards. */
export type Wardrobe = {
  /** Negative after concurrent offline purchases ("debt"): buying waits, wearing does not. */
  readonly balance: number;
  /** Items the learner has (bought; badge prizes come with slice 4). */
  readonly owned: ReadonlySet<string>;
  /** What Avi wears now. */
  readonly outfit: Outfit;
};

export function wardrobeFromRewards(rewards: Rewards): Wardrobe {
  const owned = new Set(rewards.ownedItemIds);
  return { balance: rewards.balance, owned, outfit: resolveOutfit(rewards.equipped, owned) };
}

export type ItemState = "locked" | "for-sale" | "owned" | "worn";

export function itemState(item: WardrobeItem, wardrobe: Wardrobe): ItemState {
  if (wardrobe.outfit[item.slot] === item.id) return "worn";
  if (wardrobe.owned.has(item.id)) return "owned";
  return isShopItem(item) ? "for-sale" : "locked";
}

function badgeTitle(badgeId: string): string {
  return ACHIEVEMENTS.find((a) => a.id === badgeId)?.title ?? badgeId;
}

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/** "Gorro de lana, 120 plumas, comprado, puesto"; a prize says which badge wins it. */
export function itemLabel(item: WardrobeItem, wardrobe: Wardrobe): string {
  if (!isShopItem(item)) {
    return `${item.name}, se gana con la insignia ${badgeTitle(item.badgeId)}`;
  }
  const state = itemState(item, wardrobe);
  const parts = [item.name, formatPlumas(item.price)];
  if (state === "owned" || state === "worn") parts.push("comprado");
  if (state === "worn") parts.push("puesto");
  return parts.join(", ");
}

/** The one status line on an item's card. */
export function itemStatusText(item: WardrobeItem, state: ItemState): string {
  switch (state) {
    case "worn":
      return "En uso";
    case "owned":
      return "En tu armario";
    case "locked":
      return "Con insignia";
    case "for-sale":
      return isShopItem(item) ? formatPlumas(item.price) : "Con insignia";
  }
}

/** What the wardrobe offers for the item being tried on. */
export type ItemAction =
  | { readonly kind: "buy"; readonly price: number }
  | { readonly kind: "short"; readonly missing: number; readonly text: string }
  | { readonly kind: "wear" }
  | { readonly kind: "take-off" }
  | { readonly kind: "locked"; readonly text: string };

export function itemAction(item: WardrobeItem, wardrobe: Wardrobe): ItemAction {
  const state = itemState(item, wardrobe);
  if (state === "worn") return { kind: "take-off" };
  if (state === "owned") return { kind: "wear" };
  if (!isShopItem(item)) {
    return { kind: "locked", text: `Se gana con la insignia ${badgeTitle(item.badgeId)}` };
  }
  if (wardrobe.balance >= item.price) return { kind: "buy", price: item.price };
  const missing = item.price - wardrobe.balance;
  return {
    kind: "short",
    missing,
    text: `${missing === 1 ? "Te falta" : "Te faltan"} ${formatPlumas(missing)}`,
  };
}

/** The outfit with `item` tried on in its slot (`null`: nothing being tried on). */
export function trialOutfit(outfit: Outfit, item: WardrobeItem | null): Outfit {
  return item === null ? outfit : { ...outfit, [item.slot]: item.id };
}

/** "¿Comprar el gorro de lana por 120 plumas?" */
export function purchaseQuestion(item: WardrobeItem): string {
  const price = isShopItem(item) ? ` por ${formatPlumas(item.price)}` : "";
  return `¿Comprar ${item.article} ${lowerFirst(item.name)}${price}?`;
}

/** "¡Listo! Avi ya tiene su gorro de lana." */
export function purchaseDone(item: WardrobeItem): string {
  return `¡Listo! Avi ya tiene ${item.article === "las" ? "sus" : "su"} ${lowerFirst(item.name)}.`;
}

/** The wardrobe's tabs, one per slot. */
export const SLOT_TABS: readonly { readonly slot: WardrobeSlot; readonly label: string }[] =
  WARDROBE_SLOTS.map((slot) => ({
    slot,
    label: { head: "Gorros", neck: "Cuello", eyes: "Gafas", paper: "Papel", sticker: "Stickers" }[
      slot
    ],
  }));
