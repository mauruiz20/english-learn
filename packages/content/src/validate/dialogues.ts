import { LEVELS, type Dialogue, type DialogueNode, type Level } from "../schema";
import { answerPatternErrors } from "./answer-patterns";
import { expandPattern } from "@english-learn/domain";
import { duplicateErrors } from "./helpers";
import { isPracticeFile, practiceCollectionDir } from "./practice";
import type { Rule, ValidationError } from "./types";

/**
 * Interactive dialogues ("Diálogos"): a graph of NPC lines, learner turns and endings (see
 * `schema/dialogue.ts`). The rules keep every conversation playable and gradable:
 * - ids: `<level>.dialogues.<slug>`; node and character ids unique; the start, every speaker and
 *   every `next` resolve (no dead ends);
 * - every node is reachable, there are no cycles (every path ends), a choose turn offers a good
 *   reply, and replies with only good choices (and correct writing) reach an end;
 * - every path asks the same number of learner turns, 5 to 8, so "6/6" means the same on every
 *   branch; both kinds of turn appear; at least two turns branch to different reactions;
 * - write turns hold valid answer patterns; a turn never repeats a reply.
 */

export const DIALOGUE_TURNS = { min: 5, max: 8 } as const;
/** Turns whose replies must lead to different nodes. */
export const MIN_BRANCHING_TURNS = 2;

const DIALOGUE_ID = /^(a1|a2|b1|b2|c1)\.dialogues\.[a-z0-9-]+$/;

const isTurn = (node: DialogueNode) => node.kind === "choose" || node.kind === "write";

/** The nodes a node leads to, in order (a write's `next`, then its `wrongNext`). */
function edges(node: DialogueNode): string[] {
  switch (node.kind) {
    case "npc":
      return [node.next];
    case "choose":
      return node.options.map((o) => o.next);
    case "write":
      return node.wrongNext === undefined ? [node.next] : [node.next, node.wrongNext];
    case "end":
      return [];
  }
}

/** Where the learner goes with good replies only (and correct writing). */
function goodEdges(node: DialogueNode): string[] {
  switch (node.kind) {
    case "npc":
      return [node.next];
    case "choose":
      return node.options.filter((o) => o.rating === "good").map((o) => o.next);
    case "write":
      return [node.next];
    case "end":
      return [];
  }
}

/** The first cycle a depth-first walk from `start` finds, as the ids along it; null if none. */
function findCycle(start: string, nodes: ReadonlyMap<string, DialogueNode>): string[] | null {
  const done = new Set<string>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const visit = (id: string): string[] | null => {
    if (onStack.has(id)) return [...stack.slice(stack.indexOf(id)), id];
    if (done.has(id)) return null;
    const node = nodes.get(id);
    if (node === undefined) return null;
    stack.push(id);
    onStack.add(id);
    for (const next of edges(node)) {
      const cycle = visit(next);
      if (cycle !== null) return cycle;
    }
    stack.pop();
    onStack.delete(id);
    done.add(id);
    return null;
  };
  return visit(start);
}

function reachable(
  start: string,
  nodes: ReadonlyMap<string, DialogueNode>,
  next: (node: DialogueNode) => string[],
): Set<string> {
  const seen = new Set<string>();
  const queue = [start];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const node = nodes.get(id);
    if (node !== undefined) queue.push(...next(node));
  }
  return seen;
}

/** The numbers of learner turns on the paths from each node to an end (acyclic graph). */
function turnCounts(start: string, nodes: ReadonlyMap<string, DialogueNode>): Set<number> {
  const memo = new Map<string, Set<number>>();
  const counts = (id: string): Set<number> => {
    const known = memo.get(id);
    if (known !== undefined) return known;
    const node = nodes.get(id);
    const result = new Set<number>();
    if (node === undefined) return result;
    if (node.kind === "end") result.add(0);
    for (const next of edges(node)) {
      for (const n of counts(next)) result.add(n + (isTurn(node) ? 1 : 0));
    }
    memo.set(id, result);
    return result;
  };
  return counts(start);
}

/** Per-node rules: references, replies and answer patterns. */
function nodeErrors(
  d: Dialogue,
  nodes: ReadonlyMap<string, DialogueNode>,
  file: string,
  at: string,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const characters = new Set(d.characters.map((c) => c.id));
  const fail = (path: string, message: string) => errors.push({ file, path, message });
  const resolve = (path: string, id: string) => {
    if (!nodes.has(id)) fail(path, `dead end: "${id}" is not a node`);
  };
  d.nodes.forEach((node, n) => {
    const base = `${at}.nodes[${n}]`;
    switch (node.kind) {
      case "npc":
        if (!characters.has(node.speaker)) {
          fail(`${base}.speaker`, `unknown character "${node.speaker}"`);
        }
        resolve(`${base}.next`, node.next);
        break;
      case "choose":
        if (!node.options.some((o) => o.rating === "good")) {
          fail(`${base}.options`, "a choose turn needs at least one good reply");
        }
        node.options.forEach((o, i) => resolve(`${base}.options[${i}].next`, o.next));
        errors.push(
          ...duplicateErrors(
            node.options.map((o) => o.en),
            "text",
            "reply",
            file,
            `${base}.options`,
          ).map((e) => ({ ...e, path: `${e.path}.en` })),
        );
        break;
      case "write":
        resolve(`${base}.next`, node.next);
        if (node.wrongNext !== undefined) resolve(`${base}.wrongNext`, node.wrongNext);
        errors.push(...answerPatternErrors(node.accepted, file, `${base}.accepted`));
        break;
      case "end":
        break;
    }
  });
  return errors;
}

/** Graph rules once every reference resolves: reachability, cycles, paths and branches. */
function graphErrors(
  d: Dialogue,
  nodes: ReadonlyMap<string, DialogueNode>,
  file: string,
  at: string,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const fail = (path: string, message: string) => errors.push({ file, path, message });
  const cycle = findCycle(d.start, nodes);
  if (cycle !== null) {
    fail(at, `the path ${cycle.join(" → ")} loops; every path must reach an end`);
  }
  const seen = reachable(d.start, nodes, edges);
  d.nodes.forEach((node, n) => {
    if (!seen.has(node.id)) {
      fail(`${at}.nodes[${n}]`, `node "${node.id}" is unreachable from the start`);
    }
  });
  if (cycle !== null) return errors;

  const goodPath = [...reachable(d.start, nodes, goodEdges)].some(
    (id) => nodes.get(id)?.kind === "end",
  );
  if (!goodPath) fail(at, "no path reaches an end with good replies only");

  const counts = [...turnCounts(d.start, nodes)].sort((a, b) => a - b);
  if (counts.length > 1) {
    fail(
      at,
      `every path needs the same number of learner turns; paths have ${counts.join(" or ")}`,
    );
  } else if (
    counts[0] !== undefined &&
    (counts[0] < DIALOGUE_TURNS.min || counts[0] > DIALOGUE_TURNS.max)
  ) {
    fail(
      at,
      `every path needs ${DIALOGUE_TURNS.min} to ${DIALOGUE_TURNS.max} learner turns, not ${counts[0]}`,
    );
  }

  const turns = d.nodes.filter((n) => seen.has(n.id) && isTurn(n));
  if (!turns.some((n) => n.kind === "choose") || !turns.some((n) => n.kind === "write")) {
    fail(at, "a dialogue needs both choose and write turns");
  }
  const branching = turns.filter((n) => new Set(edges(n)).size > 1).length;
  if (branching < MIN_BRANCHING_TURNS) {
    fail(
      at,
      `replies lead to different nodes in only ${branching} turn${branching === 1 ? "" : "s"}; at least ${MIN_BRANCHING_TURNS} must branch`,
    );
  }
  return errors;
}

/** Per-file dialogue rules (see the top of this file). */
export const validateDialogues: Rule = (files) => {
  const errors: ValidationError[] = [];
  for (const { file, data } of files) {
    (data.dialogues ?? []).forEach((d, i) => {
      const at = `dialogues[${i}]`;
      const fail = (path: string, message: string) => errors.push({ file, path, message });
      if (!DIALOGUE_ID.test(d.id)) {
        fail(`${at}.id`, `dialogue id "${d.id}" must look like <level>.dialogues.<slug>`);
      }
      const characterIds = d.characters.map((c) => c.id);
      characterIds.forEach((id, c) => {
        if (characterIds.indexOf(id) !== c) {
          fail(`${at}.characters[${c}].id`, `duplicate character id "${id}"`);
        }
      });
      const nodes = new Map<string, DialogueNode>();
      let unique = true;
      d.nodes.forEach((node, n) => {
        if (nodes.has(node.id)) {
          unique = false;
          fail(`${at}.nodes[${n}].id`, `duplicate node id "${node.id}"`);
        } else nodes.set(node.id, node);
      });
      const startKnown = nodes.has(d.start);
      if (!startKnown) fail(`${at}.start`, `unknown start node "${d.start}"`);
      const local = nodeErrors(d, nodes, file, at);
      errors.push(...local);
      const deadEnd = local.some((e) => e.message.startsWith("dead end"));
      if (unique && startKnown && !deadEnd) errors.push(...graphErrors(d, nodes, file, at));
    });
  }
  return errors;
};

const levelRank = (level: Level) => LEVELS.indexOf(level);

type Located = { readonly file: string; readonly index: number; readonly dialogue: Dialogue };

/**
 * Cross-file dialogue rules:
 * - a dialogue id is not a lesson or card id (results are kept by id);
 * - turn items and linked cards resolve, at or below the dialogue level, and no turn practices
 *   an item a path lesson practices (practice never changes path progress);
 * - a dialogue group lists dialogues of `practice/<its collection>/` at its level, and every
 *   dialogue is in exactly one group.
 */
export const validateDialogueReferences: Rule = (files) => {
  const errors: ValidationError[] = [];
  const items = new Map<string, Level>();
  const cards = new Map<string, Level>();
  const lessonIds = new Set<string>();
  const exerciseItems = new Map<string, readonly string[]>();
  const pathItems = new Set<string>();
  const dialogues = new Map<string, Located>();
  for (const { file, data } of files) {
    for (const item of data.items ?? []) items.set(item.id, item.level);
    for (const card of data.cards ?? []) cards.set(card.id, card.level);
    for (const exercise of data.exercises ?? []) exerciseItems.set(exercise.id, exercise.itemIds);
    for (const lesson of data.lessons ?? []) lessonIds.add(lesson.id);
    (data.dialogues ?? []).forEach((dialogue, index) => {
      if (!dialogues.has(dialogue.id)) dialogues.set(dialogue.id, { file, index, dialogue });
    });
  }
  for (const { file, data } of files) {
    if (isPracticeFile(file)) continue;
    for (const lesson of data.lessons ?? []) {
      for (const id of lesson.exerciseIds) {
        for (const itemId of exerciseItems.get(id) ?? []) pathItems.add(itemId);
      }
    }
  }

  for (const { file, data } of files) {
    (data.dialogues ?? []).forEach((d, i) => {
      const at = `dialogues[${i}]`;
      const fail = (path: string, message: string) => errors.push({ file, path, message });
      for (const [kind, ids] of [
        ["lesson", lessonIds],
        ["card", cards],
      ] as const) {
        if (ids.has(d.id)) {
          fail(`${at}.id`, `dialogue id "${d.id}" is also a ${kind} id; results are kept by id`);
        }
      }
      d.cardIds?.forEach((id, c) => {
        const level = cards.get(id);
        if (level === undefined) fail(`${at}.cardIds[${c}]`, `unknown card id "${id}"`);
        else if (levelRank(level) > levelRank(d.level)) {
          fail(`${at}.cardIds[${c}]`, `card "${id}" is ${level}, above the dialogue (${d.level})`);
        }
      });
      d.nodes.forEach((node, n) => {
        if (node.kind !== "choose" && node.kind !== "write") return;
        node.itemIds?.forEach((id, k) => {
          const path = `${at}.nodes[${n}].itemIds[${k}]`;
          const level = items.get(id);
          if (level === undefined) fail(path, `unknown item id "${id}"`);
          else if (levelRank(level) > levelRank(d.level)) {
            fail(path, `item "${id}" is ${level}, above the dialogue (${d.level})`);
          } else if (pathItems.has(id)) {
            fail(
              path,
              `dialogue "${d.id}" practices "${id}", an item of the learning path; practice must never change path progress`,
            );
          }
        });
      });
    });
  }

  const groupOf = new Map<string, string>();
  for (const { file, data } of files) {
    (data.practice ?? []).forEach((collection, i) => {
      const slug = collection.id.slice("practice.".length);
      collection.groups.forEach((group, g) => {
        if (!("dialogueIds" in group)) return;
        group.dialogueIds.forEach((id, k) => {
          const path = `practice[${i}].groups[${g}].dialogueIds[${k}]`;
          const fail = (message: string) => errors.push({ file, path, message });
          const located = dialogues.get(id);
          if (located === undefined) return fail(`unknown dialogue id "${id}"`);
          if (practiceCollectionDir(located.file) !== slug) {
            return fail(`dialogue "${id}" is not in practice/${slug}/`);
          }
          if (located.dialogue.level !== group.level) {
            fail(`dialogue "${id}" is ${located.dialogue.level} but the group is ${group.level}`);
          }
          const owner = groupOf.get(id);
          if (owner !== undefined && owner !== group.id) {
            fail(`dialogue "${id}" is already in group "${owner}"`);
          } else groupOf.set(id, group.id);
        });
      });
    });
  }
  for (const { file, index, dialogue } of dialogues.values()) {
    if (!groupOf.has(dialogue.id)) {
      errors.push({
        file,
        path: `dialogues[${index}]`,
        message: `dialogue "${dialogue.id}" is in no group`,
      });
    }
  }
  return errors;
};

/** The English of a dialogue (glossary coverage): NPC lines, replies and accepted sentences. */
export function dialogueTexts(d: Dialogue, at: string): [string, string][] {
  return d.nodes.flatMap((node, n): [string, string][] => {
    const base = `${at}.nodes[${n}]`;
    switch (node.kind) {
      case "npc":
        return [[`${base}.en`, node.en]];
      case "choose":
        return node.options.map((o, i): [string, string] => [`${base}.options[${i}].en`, o.en]);
      case "write":
        // Accepted replies are shown as corrections: every sentence a pattern stands for.
        return node.accepted.flatMap((entry, i): [string, string][] => {
          const result = expandPattern(entry);
          const sentences = result.ok ? result.expansions : [entry];
          return sentences.map((sentence) => [`${base}.accepted[${i}]`, sentence]);
        });
      case "end":
        return [];
    }
  });
}
