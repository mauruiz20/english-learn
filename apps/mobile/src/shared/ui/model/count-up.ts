/**
 * The number shown `elapsedMs` into counting from 0 up to `target` over `durationMs`: eased out
 * (fast start, slow landing), whole numbers only, never past the target. Anything that is not a
 * positive count over a positive duration shows the target at once.
 */
export function countUpValue(target: number, elapsedMs: number, durationMs: number): number {
  if (target <= 0 || durationMs <= 0) return target;
  const t = Math.min(1, Math.max(0, elapsedMs / durationMs));
  const eased = 1 - (1 - t) ** 3;
  return Math.min(target, Math.round(target * eased));
}
