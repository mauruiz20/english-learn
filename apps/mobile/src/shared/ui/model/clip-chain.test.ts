import { MAX_CLIPS_SHOWN, clipChain } from "./clip-chain";

describe("clipChain", () => {
  it("has no clips without a streak", () => {
    expect(clipChain(0)).toEqual({ clips: 0, tier: "none" });
  });

  it("adds one clip per day, up to what fits", () => {
    expect(clipChain(1).clips).toBe(1);
    expect(clipChain(3).clips).toBe(3);
    expect(clipChain(40).clips).toBe(MAX_CLIPS_SHOWN);
  });

  it.each([
    [1, "paper"],
    [6, "paper"],
    [7, "week"],
    [29, "week"],
    [30, "month"],
    [99, "month"],
    [100, "hundred"],
  ] as const)("a %i-day streak is a %s chain", (days, tier) => {
    expect(clipChain(days).tier).toBe(tier);
  });

  it("treats a negative streak as none", () => {
    expect(clipChain(-2)).toEqual({ clips: 0, tier: "none" });
  });
});
