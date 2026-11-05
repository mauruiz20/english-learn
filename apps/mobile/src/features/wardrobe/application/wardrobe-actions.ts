import {
  isShopItem,
  type LocalDate,
  type ProgressRepository,
  type WardrobeItem,
  type WardrobeSlot,
} from "@english-learn/domain";
import {
  itemEquippedEvent,
  itemPurchasedEvent,
  type RandomBytes,
} from "@/features/progress/progress-events";

type WriteContext = {
  readonly repository: ProgressRepository;
  readonly today: LocalDate;
  readonly nowMs: number;
  readonly randomBytes: RandomBytes;
  readonly deviceId: string;
};

const stampOf = ({ deviceId, nowMs, today, randomBytes }: WriteContext) => ({
  deviceId,
  occurredAt: nowMs,
  localDate: today,
  randomBytes,
});

export type BuyResult = "bought" | "short" | "owned" | "not-for-sale";

/**
 * Buys `item` for its catalogue price: one `item_purchased`. Checked against the stored balance
 * first, so a stale screen can never overspend on this device (concurrent offline purchases on
 * two devices still can: the balance then goes negative, see the design's section 3.3).
 */
export async function buyItem(
  context: WriteContext & { readonly item: WardrobeItem },
): Promise<BuyResult> {
  const { repository, item } = context;
  if (!isShopItem(item)) return "not-for-sale";
  const rewards = await repository.getRewards();
  if (rewards.ownedItemIds.includes(item.id)) return "owned";
  if (rewards.balance < item.price) return "short";
  await repository.appendEvents([itemPurchasedEvent(stampOf(context), item.id, item.price)]);
  return "bought";
}

export type WearResult = "done" | "not-owned";

/**
 * Puts `item` on in `slot` (one `item_equipped`), or takes the slot off (`item: null`). Only an
 * item the learner owns, in its own slot; the balance does not matter (a debt never undresses
 * Avi).
 */
export async function wearItem(
  context: WriteContext & { readonly slot: WardrobeSlot; readonly item: WardrobeItem | null },
): Promise<WearResult> {
  const { repository, slot, item } = context;
  if (item !== null) {
    const rewards = await repository.getRewards();
    if (item.slot !== slot || !rewards.ownedItemIds.includes(item.id)) return "not-owned";
  }
  await repository.appendEvents([itemEquippedEvent(stampOf(context), slot, item?.id ?? null)]);
  return "done";
}
