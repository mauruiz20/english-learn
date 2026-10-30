import { localDate } from "@english-learn/domain";
import { createFakeRepository } from "@/testing/fake-progress-repository";
import { createTestRandomBytes } from "@/testing/random-bytes";
import { savePlacement } from "./save-placement";

describe("savePlacement", () => {
  it("appends a placement_completed event and the result becomes the placement", async () => {
    const repository = createFakeRepository({ placement: { level: "A2", theta: -0.9 } });

    await savePlacement({
      repository,
      outcome: { level: "B1", theta: 0.42 },
      today: localDate("2026-10-29"),
      nowMs: 1_000,
      randomBytes: createTestRandomBytes(),
      deviceId: "test-device",
    });

    const placement = repository.events().filter((e) => e.type === "placement_completed");
    expect(placement).toEqual([
      expect.objectContaining({
        deviceId: "test-device",
        occurredAt: 1_000,
        localDate: "2026-10-29",
        payload: { v: 1, level: "B1", theta: 0.42 },
      }),
    ]);
    expect(await repository.getPlacementResult()).toEqual({ level: "B1", theta: 0.42 });
    // Placement never touches XP, streak or review states.
    expect(await repository.getXp()).toBe(0);
  });
});
