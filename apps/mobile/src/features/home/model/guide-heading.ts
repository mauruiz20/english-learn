/**
 * How Avi sits on the next sticker of the home path so it points along the pencil line that comes
 * down to it: facing right from a stop on the left (perched at the sticker's top left), mirrored
 * from a stop on the right (perched at its top right). Either way the nose tilts down toward the
 * sticker.
 */
export type GuideHeading = {
  facing: "right" | "left";
  /** Final rotation of the plane, in degrees (positive turns the nose down). */
  tilt: number;
  /** Which top corner of the sticker the plane perches on. */
  corner: "left" | "right";
};

/** The art's nose already points ≈ 17° up; this leaves it ≈ 21° below the horizontal. */
export const GUIDE_TILT = 38;

/** `previousOffset` / `offset` are the stops' positions across the page (0–1). */
export function guideHeading(previousOffset: number | undefined, offset: number): GuideHeading {
  if (previousOffset !== undefined && previousOffset > offset) {
    return { facing: "left", tilt: GUIDE_TILT, corner: "right" };
  }
  return { facing: "right", tilt: GUIDE_TILT, corner: "left" };
}
