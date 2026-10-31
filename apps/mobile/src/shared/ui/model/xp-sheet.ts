/** XP that fills one sheet of stickers (the home's XP bar). */
export const XP_PER_SHEET = 250;

export type XpSheet = {
  /** 1-based number of the sheet being filled. */
  readonly sheet: number;
  /** XP on the current sheet, 0 ≤ filled < XP_PER_SHEET. */
  readonly filled: number;
  /** XP left to complete it. */
  readonly remaining: number;
  /** filled / XP_PER_SHEET, for the bar. */
  readonly fraction: number;
};

/** Where total XP leaves the learner: which sheet of stickers and how full it is. */
export function xpSheet(xp: number): XpSheet {
  const total = Number.isFinite(xp) ? Math.max(0, Math.floor(xp)) : 0;
  const filled = total % XP_PER_SHEET;
  return {
    sheet: Math.floor(total / XP_PER_SHEET) + 1,
    filled,
    remaining: XP_PER_SHEET - filled,
    fraction: filled / XP_PER_SHEET,
  };
}
