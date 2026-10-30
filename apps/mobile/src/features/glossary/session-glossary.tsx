import type { Corpus } from "@english-learn/content";
import type { ReactNode } from "react";
import { topicHighlighter } from "@/features/topics/topic-colors";
import { GlossaryProvider } from "./glossary-provider";
import { buildEntryItems } from "./model/item-entries";

const entryItemsCache = new WeakMap<Corpus, ReadonlyMap<string, readonly string[]>>();

/** Glossary entry id → ids of the items whose term it is; built once per corpus. */
export function entryItemsOf(content: Corpus): ReadonlyMap<string, readonly string[]> {
  const cached = entryItemsCache.get(content);
  if (cached !== undefined) return cached;
  const built = buildEntryItems([...content.itemsById.values()], content.glossaryIndex);
  entryItemsCache.set(content, built);
  return built;
}

/**
 * Word lookups for a lesson or review session: the corpus glossary, the topic's highlighter on
 * the card, and every lookup reported as the items it matches (the SRS "looked up" signal).
 */
export function SessionGlossary({
  content,
  topic,
  onLookupItems,
  children,
}: {
  content: Corpus;
  topic: string | undefined;
  onLookupItems: (itemIds: readonly string[]) => void;
  children: ReactNode;
}) {
  return (
    <GlossaryProvider
      index={content.glossaryIndex}
      tint={topic === undefined ? undefined : topicHighlighter(topic)}
      onLookup={(entryId) => onLookupItems(entryItemsOf(content).get(entryId) ?? [])}
    >
      {children}
    </GlossaryProvider>
  );
}
