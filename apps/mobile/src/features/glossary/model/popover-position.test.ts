import { popoverPosition, POPOVER_GAP, VIEWPORT_MARGIN } from "./popover-position";

const viewport = { width: 1280, height: 800 };
const word = { top: 300, bottom: 324, left: 600, width: 60 };

describe("popoverPosition", () => {
  it("centers the card under the word", () => {
    expect(popoverPosition({ anchor: word, viewport, height: 120, maxWidth: 300 })).toEqual({
      top: 324 + POPOVER_GAP,
      left: 630 - 150,
      width: 300,
      placement: "below",
    });
  });

  it("goes above the word when there is no room below", () => {
    const low = { ...word, top: 720, bottom: 744 };
    expect(popoverPosition({ anchor: low, viewport, height: 120, maxWidth: 300 })).toMatchObject({
      top: 720 - POPOVER_GAP - 120,
      placement: "above",
    });
  });

  it("stays below, clamped to the viewport, when it fits neither way", () => {
    const small = { width: 390, height: 260 };
    const position = popoverPosition({
      anchor: { top: 80, bottom: 100, left: 10, width: 40 },
      viewport: small,
      height: 180,
      maxWidth: 300,
    });
    expect(position.placement).toBe("below");
    expect(position.top).toBe(260 - VIEWPORT_MARGIN - 180);
  });

  it("keeps the card inside the left and right edges", () => {
    const atLeft = popoverPosition({
      anchor: { ...word, left: 2 },
      viewport,
      height: 100,
      maxWidth: 300,
    });
    expect(atLeft.left).toBe(VIEWPORT_MARGIN);
    const atRight = popoverPosition({
      anchor: { ...word, left: 1270 },
      viewport,
      height: 100,
      maxWidth: 300,
    });
    expect(atRight.left).toBe(1280 - VIEWPORT_MARGIN - 300);
  });

  it("narrows the card on a small screen, keeping the side margins", () => {
    const position = popoverPosition({
      anchor: word,
      viewport: { width: 320, height: 640 },
      height: 100,
      maxWidth: 300,
    });
    expect(position.width).toBe(320 - 2 * VIEWPORT_MARGIN);
    expect(position.left).toBe(VIEWPORT_MARGIN);
  });
});
