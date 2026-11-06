import type { LoadedFile, Rule, ValidationError } from "./types";

type Kind = "items" | "exercises" | "passages" | "lessons" | "placement" | "cards" | "dialogues";
const KINDS: readonly Kind[] = [
  "items",
  "exercises",
  "passages",
  "lessons",
  "placement",
  "cards",
  "dialogues",
];

/** Ids must be unique among entities of the same kind, across the whole corpus. */
export const validateUniqueIds: Rule = (files: readonly LoadedFile[]) => {
  const errors: ValidationError[] = [];
  for (const kind of KINDS) {
    const seen = new Map<string, string>();
    for (const { file, data } of files) {
      (data[kind] ?? []).forEach((entity, i) => {
        const where = `${file} ${kind}[${i}]`;
        const first = seen.get(entity.id);
        if (first === undefined) {
          seen.set(entity.id, where);
        } else {
          errors.push({
            file,
            path: `${kind}[${i}].id`,
            message: `duplicate ${kind} id "${entity.id}" (first defined at ${first})`,
          });
        }
      });
    }
  }
  return errors;
};
