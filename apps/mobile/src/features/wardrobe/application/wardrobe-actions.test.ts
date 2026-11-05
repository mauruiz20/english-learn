import { catalogItem, localDate, type WardrobeItem } from "@english-learn/domain";
import { createFakeRepository } from "@/testing/fake-progress-repository";
import { createTestRandomBytes } from "@/testing/random-bytes";
import { buyItem, wearItem } from "./wardrobe-actions";

const item = (id: string): WardrobeItem => catalogItem(id)!;

/** A learner with `lessons` lessons from before the event log: 5 welcome plumas each. */
function learner(lessons: number) {
  return createFakeRepository({
    xp: 1,
    completedLessonIds: Array.from({ length: lessons }, (_, i) => `l${i}`),
  });
}

// One source for the whole file: every event gets a fresh id.
const randomBytes = createTestRandomBytes();

const at = (repository: ReturnType<typeof learner>) => ({
  repository,
  today: localDate("2026-11-05"),
  nowMs: Date.UTC(2026, 10, 5, 12),
  randomBytes,
  deviceId: "device-a",
});

describe("buying for Avi", () => {
  it("writes one purchase at the catalogue price and spends it", async () => {
    const repository = learner(10); // 50 plumas

    expect(await buyItem({ ...at(repository), item: item("estrella") })).toBe("bought");

    const purchase = repository.events().at(-1)!;
    expect(purchase).toMatchObject({
      type: "item_purchased",
      deviceId: "device-a",
      localDate: "2026-11-05",
      payload: { v: 1, itemId: "estrella", price: 40 },
    });
    const rewards = await repository.getRewards();
    expect(rewards.balance).toBe(10);
    expect(rewards.ownedItemIds).toEqual(["estrella"]);
  });

  it("writes nothing when the balance is not enough", async () => {
    const repository = learner(10); // 50 plumas

    expect(await buyItem({ ...at(repository), item: item("panuelo") })).toBe("short");
    expect(repository.events().map((e) => e.type)).toEqual(["baseline_imported"]);
  });

  it("writes nothing with a negative balance, however cheap the item", async () => {
    const repository = learner(10);
    await buyItem({ ...at(repository), item: item("estrella") });
    // Another device's purchase arrives by sync: the two together overspent.
    await repository.appendEvents([
      {
        id: "019a0000-0000-7000-8000-000000000001",
        deviceId: "device-b",
        occurredAt: 1,
        localDate: localDate("2026-11-04"),
        type: "item_purchased",
        payload: { v: 1, itemId: "papel-cielo", price: 50 },
      },
    ]);
    expect((await repository.getRewards()).balance).toBe(-40);

    expect(await buyItem({ ...at(repository), item: item("corazon") })).toBe("short");
    expect(repository.events()).toHaveLength(3);
  });

  it("never charges twice for an item already owned, nor sells a badge prize", async () => {
    const repository = learner(20); // 100 plumas
    await buyItem({ ...at(repository), item: item("estrella") });

    expect(await buyItem({ ...at(repository), item: item("estrella") })).toBe("owned");
    expect(await buyItem({ ...at(repository), item: item("birrete") })).toBe("not-for-sale");
    expect(repository.events()).toHaveLength(2);
  });
});

describe("dressing Avi", () => {
  it("puts on an item the learner owns, and takes it off", async () => {
    const repository = learner(10);
    await buyItem({ ...at(repository), item: item("estrella") });

    expect(await wearItem({ ...at(repository), slot: "sticker", item: item("estrella") })).toBe(
      "done",
    );
    expect((await repository.getRewards()).equipped).toEqual({ sticker: "estrella" });

    expect(await wearItem({ ...at(repository), slot: "sticker", item: null })).toBe("done");
    expect((await repository.getRewards()).equipped).toEqual({ sticker: null });
    expect(repository.events().at(-1)).toMatchObject({
      type: "item_equipped",
      payload: { v: 1, slot: "sticker", itemId: null },
    });
  });

  it("dresses Avi even when the balance is negative", async () => {
    const repository = learner(10);
    await buyItem({ ...at(repository), item: item("estrella") });
    await repository.appendEvents([
      {
        id: "019a0000-0000-7000-8000-000000000002",
        deviceId: "device-b",
        occurredAt: 1,
        localDate: localDate("2026-11-04"),
        type: "item_purchased",
        payload: { v: 1, itemId: "papel-cielo", price: 50 },
      },
    ]);

    expect(await wearItem({ ...at(repository), slot: "paper", item: item("papel-cielo") })).toBe(
      "done",
    );
    expect((await repository.getRewards()).equipped).toEqual({ paper: "papel-cielo" });
  });

  it("never puts on an item the learner does not own, or in another slot", async () => {
    const repository = learner(10);

    expect(await wearItem({ ...at(repository), slot: "head", item: item("gorra") })).toBe(
      "not-owned",
    );
    await buyItem({ ...at(repository), item: item("estrella") });
    expect(await wearItem({ ...at(repository), slot: "head", item: item("estrella") })).toBe(
      "not-owned",
    );
    expect(repository.events().filter((e) => e.type === "item_equipped")).toEqual([]);
  });
});
