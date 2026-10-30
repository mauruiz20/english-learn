import { LEVELS, type Level } from "../schema";
import type { LoadedFile, Rule, ValidationError } from "./types";

const PLACEMENT_DIR = "placement";
const GLOSSARY_DIR = "glossary";
const DIRS = [...LEVELS.map((l) => l.toLowerCase()), PLACEMENT_DIR, GLOSSARY_DIR];
const ENTITY_KINDS = ["items", "exercises", "passages", "lessons"] as const;

/**
 * Directory <-> content. Fails closed: every file must sit under
 * `data/<a1|a2|b1|b2|c1|placement|glossary>/` (subdirectories allowed).
 * - `placement/` holds only `placement` entries; level dirs never hold them.
 * - `glossary/` holds only `glossary` entries; no other directory holds them.
 * - Every entity under `<level>/` has that level.
 * - An id's level prefix matches the entity's `level` field.
 */
export const validateLayout: Rule = (files: readonly LoadedFile[]) => {
  const errors: ValidationError[] = [];
  for (const { file, data } of files) {
    const segments = file.split("/");
    const dir = segments[0] ?? "";
    if (segments.length < 2) {
      errors.push({
        file,
        path: "(root)",
        message: `content files must live in data/<${DIRS.join("|")}>/; "${file}" is at the root`,
      });
    } else if (!DIRS.includes(dir)) {
      errors.push({
        file,
        path: "(root)",
        message: `unknown content directory "${dir}"; expected one of ${DIRS.join(", ")}`,
      });
    } else if (dir === GLOSSARY_DIR) {
      for (const kind of [...ENTITY_KINDS, "placement"] as const) {
        (data[kind] ?? []).forEach((_, i) =>
          errors.push({
            file,
            path: `${kind}[${i}]`,
            message: `${GLOSSARY_DIR}/ may contain only glossary entries`,
          }),
        );
      }
    } else if (dir === PLACEMENT_DIR) {
      for (const kind of ENTITY_KINDS) {
        (data[kind] ?? []).forEach((_, i) =>
          errors.push({
            file,
            path: `${kind}[${i}]`,
            message: `${PLACEMENT_DIR}/ may contain only placement entries`,
          }),
        );
      }
    } else {
      const level = dir.toUpperCase() as Level;
      (data.placement ?? []).forEach((_, i) =>
        errors.push({
          file,
          path: `placement[${i}]`,
          message: `placement entries belong in ${PLACEMENT_DIR}/, not ${dir}/`,
        }),
      );
      for (const kind of ENTITY_KINDS) {
        (data[kind] ?? []).forEach((entity, i) => {
          if (entity.level !== level) {
            errors.push({
              file,
              path: `${kind}[${i}].level`,
              message: `level ${entity.level} does not match directory level ${level}`,
            });
          }
        });
      }
    }

    if (DIRS.includes(dir) && dir !== GLOSSARY_DIR) {
      (data.glossary ?? []).forEach((_, i) =>
        errors.push({
          file,
          path: `glossary[${i}]`,
          message: `glossary entries belong in ${GLOSSARY_DIR}/, not ${dir}/`,
        }),
      );
    }

    for (const kind of ENTITY_KINDS) {
      (data[kind] ?? []).forEach((entity, i) => {
        const prefix = `${entity.level.toLowerCase()}.`;
        if (!entity.id.startsWith(prefix)) {
          errors.push({
            file,
            path: `${kind}[${i}].id`,
            message: `id "${entity.id}" does not start with its level "${prefix}"`,
          });
        }
      });
    }
    (data.placement ?? []).forEach((q, i) => {
      const prefix = `placement.${q.level.toLowerCase()}.`;
      if (!q.id.startsWith(prefix)) {
        errors.push({
          file,
          path: `placement[${i}].id`,
          message: `id "${q.id}" does not start with "${prefix}"`,
        });
      }
    });
  }
  return errors;
};
