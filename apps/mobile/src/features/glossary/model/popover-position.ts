/** Space between the word and the card (px). */
export const POPOVER_GAP = 8;
/** The card never gets closer than this to the viewport's edges (px). */
export const VIEWPORT_MARGIN = 16;

type Rect = {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly width: number;
};

export type PopoverPosition = {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly placement: "below" | "above";
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

/**
 * Where to put a card of `height` anchored to a word (viewport coordinates): centered on the
 * word, below it, or above when it does not fit below but does above; never past the viewport's
 * margins (narrower than `maxWidth` on small screens).
 */
export function popoverPosition({
  anchor,
  viewport,
  height,
  maxWidth,
}: {
  anchor: Rect;
  viewport: { readonly width: number; readonly height: number };
  height: number;
  maxWidth: number;
}): PopoverPosition {
  const width = Math.min(maxWidth, viewport.width - 2 * VIEWPORT_MARGIN);
  const center = anchor.left + anchor.width / 2;
  const left = clamp(center - width / 2, VIEWPORT_MARGIN, viewport.width - VIEWPORT_MARGIN - width);
  const below = anchor.bottom + POPOVER_GAP;
  const above = anchor.top - POPOVER_GAP - height;
  const fitsBelow = below + height <= viewport.height - VIEWPORT_MARGIN;
  if (!fitsBelow && above >= VIEWPORT_MARGIN)
    return { top: above, left, width, placement: "above" };
  const top = clamp(below, VIEWPORT_MARGIN, viewport.height - VIEWPORT_MARGIN - height);
  return { top, left, width, placement: "below" };
}
