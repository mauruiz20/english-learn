import { LEVELS, type Card, type Level } from "../schema";
import { duplicateErrors, normalize } from "./helpers";
import { idTopic } from "./topics";
import type { LoadedFile, Rule, ValidationError } from "./types";

const rank = (l: Level): number => LEVELS.indexOf(l);

/**
 * Per-file card rules (no references resolved):
 * - The id topic segment is the card topic.
 * - A card lives in `<level>/<topic>.json` (its level directory is checked by validateLayout).
 * - A pitfall's `wrong` and `right` differ (normalized).
 * - No duplicates inside a card: uses, example sentences, phrasal verbs and collocations
 *   (normalized text), item ids and exercise ids (exact).
 */
export const validateCards: Rule = (files: readonly LoadedFile[]) => {
  const errors: ValidationError[] = [];
  for (const { file, data } of files) {
    (data.cards ?? []).forEach((card, i) => {
      const at = `cards[${i}]`;
      if (idTopic(card.id) !== card.topic) {
        errors.push({
          file,
          path: `${at}.id`,
          message: `card id "${card.id}" must have the topic segment "${card.topic}"`,
        });
      }
      const segments = file.split("/");
      if (segments.length !== 2 || segments[1] !== `${card.topic}.json`) {
        errors.push({
          file,
          path: at,
          message: `${card.topic} cards belong in <level>/${card.topic}.json`,
        });
      }
      errors.push(...duplicateErrors(card.uses, "text", "use", file, `${at}.uses`));
      card.pitfalls.forEach((p, j) => {
        if (normalize(p.wrong) === normalize(p.right)) {
          errors.push({
            file,
            path: `${at}.pitfalls[${j}]`,
            message: 'pitfall "wrong" and "right" are the same sentence',
          });
        }
      });
      errors.push(...fieldDuplicates(card.examples, "en", "example", file, `${at}.examples`));
      if (card.kind === "phrasal_verbs") {
        errors.push(
          ...fieldDuplicates(card.entries, "verb", "phrasal verb", file, `${at}.entries`),
        );
      }
      if (card.kind === "vocabulary" && card.collocations !== undefined) {
        errors.push(
          ...fieldDuplicates(card.collocations, "en", "collocation", file, `${at}.collocations`),
        );
      }
      errors.push(...duplicateErrors(card.itemIds, "exact", "item id", file, `${at}.itemIds`));
      errors.push(
        ...duplicateErrors(card.exerciseIds, "exact", "exercise id", file, `${at}.exerciseIds`),
      );
    });
  }
  return errors;
};

/** Duplicate text of one field of a list of objects, reported at `<base>[i].<field>`. */
function fieldDuplicates<K extends string, T extends Record<K, string>>(
  values: readonly T[],
  field: K,
  label: string,
  file: string,
  base: string,
): ValidationError[] {
  return duplicateErrors(
    values.map((v) => v[field]),
    "text",
    label,
    file,
    base,
  ).map((e) => ({ ...e, path: `${e.path}.${field}` }));
}

/**
 * Cross-file card rules (unknown ids are reported here, then skipped):
 * - `itemIds` and `exerciseIds` resolve.
 * - Each exercise has the card level and the card topic segment.
 * - Each item is at or below the card level and has the card topic.
 * - Every item an exercise practices belongs to the card, and every card item is
 *   practiced by at least one of the card exercises (so SRS never schedules an
 *   item the card cannot practice).
 * - An exercise belongs to at most one card.
 */
export const validateCardReferences: Rule = (files: readonly LoadedFile[]) => {
  const items = new Map(files.flatMap((f) => (f.data.items ?? []).map((e) => [e.id, e] as const)));
  const exercises = new Map(
    files.flatMap((f) => (f.data.exercises ?? []).map((e) => [e.id, e] as const)),
  );
  const owner = new Map<string, string>();

  const errors: ValidationError[] = [];
  for (const { file, data } of files) {
    (data.cards ?? []).forEach((card: Card, i) => {
      const at = `cards[${i}]`;
      const cardItems = new Set(card.itemIds);
      const practiced = new Set<string>();

      card.itemIds.forEach((id, j) => {
        const path = `${at}.itemIds[${j}]`;
        const item = items.get(id);
        if (item === undefined) {
          errors.push({ file, path, message: `unknown item id "${id}"` });
          return;
        }
        if (rank(item.level) > rank(card.level)) {
          errors.push({
            file,
            path,
            message: `item "${id}" is ${item.level}, above the card level ${card.level}`,
          });
        }
        if (!item.topics.includes(card.topic)) {
          errors.push({
            file,
            path,
            message: `item "${id}" does not have the card topic "${card.topic}"`,
          });
        }
      });

      card.exerciseIds.forEach((id, j) => {
        const path = `${at}.exerciseIds[${j}]`;
        const exercise = exercises.get(id);
        if (exercise === undefined) {
          errors.push({ file, path, message: `unknown exercise id "${id}"` });
          return;
        }
        if (exercise.level !== card.level) {
          errors.push({
            file,
            path,
            message: `exercise "${id}" is ${exercise.level} but the card is ${card.level}`,
          });
        }
        if (idTopic(id) !== card.topic) {
          errors.push({
            file,
            path,
            message: `exercise "${id}" is not in the card topic "${card.topic}"`,
          });
        }
        for (const itemId of exercise.itemIds) {
          practiced.add(itemId);
          if (!cardItems.has(itemId)) {
            errors.push({
              file,
              path,
              message: `exercise "${id}" practices item "${itemId}", which is not in the card`,
            });
          }
        }
        const first = owner.get(id);
        if (first === undefined) owner.set(id, card.id);
        else {
          errors.push({
            file,
            path,
            message: `exercise "${id}" already belongs to card "${first}"`,
          });
        }
      });

      card.itemIds.forEach((id, j) => {
        if (items.has(id) && !practiced.has(id)) {
          errors.push({
            file,
            path: `${at}.itemIds[${j}]`,
            message: `item "${id}" is not practiced by any of the card exercises`,
          });
        }
      });
    });
  }
  return errors;
};
