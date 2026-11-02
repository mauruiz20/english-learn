import { GUIDE_TILT, guideHeading } from "./guide-heading";

describe("guideHeading", () => {
  it("faces right and perches top-left when the path comes down from the left", () => {
    expect(guideHeading(0, 0.16)).toEqual({ facing: "right", tilt: GUIDE_TILT, corner: "left" });
  });

  it("faces left (mirrored) and perches top-right when the path comes down from the right", () => {
    expect(guideHeading(0.32, 0.16)).toEqual({ facing: "left", tilt: GUIDE_TILT, corner: "right" });
  });

  it("faces right when there is no previous stop (first stop of a topic)", () => {
    expect(guideHeading(undefined, 0.32)).toEqual({
      facing: "right",
      tilt: GUIDE_TILT,
      corner: "left",
    });
  });

  it("faces right when the path comes straight down", () => {
    expect(guideHeading(0.16, 0.16).facing).toBe("right");
  });

  it("tilts the nose down, toward the sticker below (the art itself points 17° up)", () => {
    expect(GUIDE_TILT).toBeGreaterThan(17);
  });
});
