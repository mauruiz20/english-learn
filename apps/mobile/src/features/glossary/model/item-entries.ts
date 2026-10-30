import { annotateText, type GlossaryIndex } from "@english-learn/domain";

/**
 * The ways a lesson item's term can be written: the term itself, without its parenthesized
 * part and with it unwrapped (`go straight (ahead)` → `go straight`, `go straight ahead`), and
 * each side of a slash (`there is / there are`), and the part before a `+` pattern
 * (`look forward to + -ing` → `look forward to`).
 */
function termVariants(term: string): string[] {
  const variants = term.split("/").flatMap((side) => {
    const part = side.replace(/\s\+.*$/u, "");
    const withoutParens = part.replace(/\([^)]*\)/gu, " ");
    const unwrapped = part.replace(/[()]/gu, " ");
    return [part, withoutParens, unwrapped];
  });
  return [...new Set(variants.map((v) => v.replace(/\s+/gu, " ").trim()))].filter(
    (v) => v.length > 0,
  );
}

/**
 * Glossary entries a lesson item's term IS: a variant of the term whose words the glossary
 * links as one single word or phrase. Terms that only some entries partly cover (grammar items,
 * whole sentences such as `Excuse me, where is...?`) match nothing.
 */
export function itemEntryIds(term: string, index: GlossaryIndex): string[] {
  const ids: string[] = [];
  for (const variant of termVariants(term)) {
    const words = annotateText(variant, index).filter((s) => s.kind !== "other");
    const [only] = words;
    if (words.length !== 1 || only?.entryId == null) continue;
    if (!ids.includes(only.entryId)) ids.push(only.entryId);
  }
  return ids;
}

/** Glossary entry id → ids of the items whose term it is (built once per corpus). */
export function buildEntryItems(
  items: readonly { readonly id: string; readonly term: string }[],
  index: GlossaryIndex,
): ReadonlyMap<string, readonly string[]> {
  const map = new Map<string, string[]>();
  for (const item of items) {
    for (const entryId of itemEntryIds(item.term, index)) {
      const list = map.get(entryId) ?? [];
      list.push(item.id);
      map.set(entryId, list);
    }
  }
  return map;
}
