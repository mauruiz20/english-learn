/** Clips drawn at most in the streak's chain; a longer streak only changes their color. */
export const MAX_CLIPS_SHOWN = 5;

/** The chain's color: plain clips, then new colors at a week, a month and 100 days. */
export type ClipTier = "none" | "paper" | "week" | "month" | "hundred";

export type ClipChain = { readonly clips: number; readonly tier: ClipTier };

/** The paperclip chain for a streak of `days` days: one clip per day, up to what fits. */
export function clipChain(days: number): ClipChain {
  const d = Number.isFinite(days) ? Math.floor(days) : 0;
  if (d <= 0) return { clips: 0, tier: "none" };
  const tier: ClipTier = d >= 100 ? "hundred" : d >= 30 ? "month" : d >= 7 ? "week" : "paper";
  return { clips: Math.min(d, MAX_CLIPS_SHOWN), tier };
}
