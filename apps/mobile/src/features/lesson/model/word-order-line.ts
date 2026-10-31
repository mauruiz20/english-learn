// The answer line of a word-order exercise, as token indexes in order, and where a dragged paper
// strip lands on it. Pure: the component measures the strips and hands over rectangles.

export type Point = { readonly x: number; readonly y: number };
export type Rect = Point & { readonly width: number; readonly height: number };

/**
 * Where a strip dropped at `point` goes among the strips on the line (`slots`, in line order,
 * possibly wrapped over several rows): before the first strip of the drop's row whose middle is
 * right of the drop, after the row's last strip when dropped past it, first when dropped above
 * every row and last when below.
 */
export function insertionIndex(slots: readonly Rect[], point: Point): number {
  for (const [i, slot] of slots.entries()) {
    if (point.y < slot.y) return i;
    if (point.y <= slot.y + slot.height && point.x < slot.x + slot.width / 2) return i;
  }
  return slots.length;
}

/**
 * The line with the strip at `from` moved to insertion index `insertAt` (counted with the strip
 * still in place, as measured before the drag). The same line when nothing moves.
 */
export function moveWithinLine(
  line: readonly number[],
  from: number,
  insertAt: number,
): readonly number[] {
  const token = line[from];
  if (token === undefined) return line;
  const to = insertAt > from ? insertAt - 1 : insertAt;
  if (to === from) return line;
  const rest = line.filter((_, i) => i !== from);
  return [...rest.slice(0, to), token, ...rest.slice(to)];
}

/**
 * The line after dropping `token` at `position` (an index in the line without that token): a
 * word from the bank is added there; a word already on the line moves there.
 */
export function dropOnLine(
  line: readonly number[],
  token: number,
  position: number,
): readonly number[] {
  const rest = line.filter((t) => t !== token);
  const at = Math.min(Math.max(0, position), rest.length);
  return [...rest.slice(0, at), token, ...rest.slice(at)];
}
