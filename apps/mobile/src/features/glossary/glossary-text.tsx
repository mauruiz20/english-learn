import { annotateText } from "@english-learn/domain";
import { useMemo } from "react";
import { Text, type TextProps } from "@/shared/ui/text";
import { useGlossary } from "./glossary-provider";
import { LookupTarget } from "./lookup-target";
import { lookupRuns, type LookupLocks, type LookupRun } from "./model/lookup-runs";

/** Each run with its offset in the text (a stable key for its target). */
function withOffsets(runs: readonly LookupRun[]): { run: LookupRun; start: number }[] {
  const result: { run: LookupRun; start: number }[] = [];
  let start = 0;
  for (const run of runs) {
    result.push({ run, start });
    start += run.text.length;
  }
  return result;
}

type GlossaryRunsProps = LookupLocks & {
  text: string;
  /** Lookups on in this area right now (see `lookupEnabled`); off renders plain text. */
  enabled?: boolean | undefined;
};

/**
 * The inline content of an English text with its glossary words as lookup targets, to place
 * inside any `Text` (it keeps the parent's font, color and wrapping). Annotated once per text.
 * Outside a `GlossaryProvider`, or when `enabled` is false, it is the plain text.
 */
export function GlossaryRuns({
  text,
  enabled = true,
  lockedRanges,
  lockedEntryIds,
}: GlossaryRunsProps) {
  const glossary = useGlossary();
  const index = enabled ? glossary?.index : undefined;
  const segments = useMemo(
    () => (index === undefined ? null : annotateText(text, index)),
    [text, index],
  );
  if (segments === null) return text;
  return withOffsets(lookupRuns(segments, { lockedRanges, lockedEntryIds })).map(
    ({ run, start }) =>
      run.entryId === null ? (
        run.text
      ) : (
        <LookupTarget key={start} text={run.text} entryId={run.entryId} />
      ),
  );
}

type GlossaryTextProps = Omit<TextProps, "children"> & GlossaryRunsProps;

/** A themed `Text` whose English words can be looked up (see `GlossaryRuns`). */
export function GlossaryText({
  text,
  enabled,
  lockedRanges,
  lockedEntryIds,
  ...props
}: GlossaryTextProps) {
  return (
    <Text {...props}>
      <GlossaryRuns
        text={text}
        enabled={enabled}
        lockedRanges={lockedRanges}
        lockedEntryIds={lockedEntryIds}
      />
    </Text>
  );
}
