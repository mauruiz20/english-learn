import type { Segment } from "@english-learn/domain";

/** A `[start, end)` character range of a text. */
export type TextRange = readonly [start: number, end: number];

export type LookupLocks = {
  /** Text that must not be looked up (e.g. the evaluated term), as character ranges. */
  readonly lockedRanges?: readonly TextRange[] | undefined;
  /** Glossary entries that must not be looked up anywhere in the text. */
  readonly lockedEntryIds?: readonly string[] | undefined;
};

/** A run of text to render: a lookup target (`entryId`) or plain text (`null`). */
export type LookupRun = { readonly text: string; readonly entryId: string | null };

const overlaps = (segment: Segment, [start, end]: TextRange) =>
  segment.start < end && start < segment.end;

/**
 * Turns annotated segments into render runs: every covered word or phrase that is not locked
 * becomes a lookup target; everything else is merged into plain text runs (fewer nodes for long
 * passages). A phrase that touches a locked range is locked whole.
 */
export function lookupRuns(
  segments: readonly Segment[],
  { lockedRanges = [], lockedEntryIds = [] }: LookupLocks = {},
): LookupRun[] {
  const runs: LookupRun[] = [];
  for (const segment of segments) {
    const locked =
      segment.entryId === null ||
      lockedEntryIds.includes(segment.entryId) ||
      lockedRanges.some((range) => overlaps(segment, range));
    const entryId = locked ? null : segment.entryId;
    const last = runs.at(-1);
    if (entryId === null && last !== undefined && last.entryId === null) {
      runs[runs.length - 1] = { text: last.text + segment.text, entryId: null };
    } else {
      runs.push({ text: segment.text, entryId });
    }
  }
  return runs;
}
