import { normalize } from "./helpers";
import { LEVEL_INTRO_FILE } from "./schema";
import type { LoadedFile, Rule, ValidationError } from "./types";

/**
 * Lesson and level intros, per file (their counts and lengths are the schema's; voseo and
 * glossary coverage are rules 8 and 16):
 * - a lesson intro's mistake has different `wrong` and `right` sentences (normalized);
 * - a level intro lives in its own level's `level.json`.
 */
export const validateIntros: Rule = (files: readonly LoadedFile[]) => {
  const errors: ValidationError[] = [];
  for (const { file, data } of files) {
    (data.lessons ?? []).forEach((lesson, i) => {
      const mistake = lesson.intro?.mistake;
      if (mistake !== undefined && normalize(mistake.wrong) === normalize(mistake.right)) {
        errors.push({
          file,
          path: `lessons[${i}].intro.mistake`,
          message: 'the mistake\'s "wrong" and "right" are the same sentence (normalized)',
        });
      }
    });
    const intro = data.levelIntro;
    if (intro === undefined) continue;
    const dir = LEVEL_INTRO_FILE.exec(file)?.[1];
    if (dir === undefined) {
      errors.push({
        file,
        path: "levelIntro",
        message: "a level intro lives in <level>/level.json",
      });
    } else if (dir.toUpperCase() !== intro.level) {
      errors.push({
        file,
        path: "level",
        message: `level ${intro.level} does not match directory level ${dir.toUpperCase()}`,
      });
    }
  }
  return errors;
};
