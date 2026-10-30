import { formatPath } from "./helpers";

export interface DuplicateKey {
  /** Path of the repeated key, e.g. `items[0].term`. */
  path: string;
  key: string;
}

type Frame =
  | { kind: "object"; keys: Set<string>; key: string | undefined; expectKey: boolean }
  | { kind: "array"; index: number };

/**
 * `JSON.parse` silently keeps the last of two equal keys, hiding authoring
 * mistakes. This single-pass scanner reports every repeated key in an object.
 * It assumes `text` is valid JSON (run it after `JSON.parse` succeeds).
 */
export function findDuplicateKeys(text: string): DuplicateKey[] {
  const out: DuplicateKey[] = [];
  const stack: Frame[] = [];
  const segments = (): (string | number)[] =>
    stack.map((f) => (f.kind === "object" ? (f.key ?? "") : f.index));

  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    const top = stack[stack.length - 1];
    if (ch === "{") {
      stack.push({ kind: "object", keys: new Set(), key: undefined, expectKey: true });
      i++;
    } else if (ch === "[") {
      stack.push({ kind: "array", index: 0 });
      i++;
    } else if (ch === "}" || ch === "]") {
      stack.pop();
      i++;
    } else if (ch === ",") {
      if (top?.kind === "array") top.index++;
      else if (top?.kind === "object") top.expectKey = true;
      i++;
    } else if (ch === '"') {
      let j = i + 1;
      while (text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      if (top?.kind === "object" && top.expectKey) {
        const key = JSON.parse(text.slice(i, j + 1)) as string;
        top.key = key;
        top.expectKey = false;
        if (top.keys.has(key)) out.push({ path: formatPath(segments()), key });
        top.keys.add(key);
      }
      i = j + 1;
    } else {
      // whitespace, `:`, numbers, true/false/null
      i++;
    }
  }
  return out;
}
