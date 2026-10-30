import { exerciseEntries, normalize } from "./helpers";
import type { LoadedFile, Rule, ValidationError } from "./types";

interface OptionSet {
  file: string;
  /** Path to the object that owns `options` and `answerIndex`. */
  path: string;
  options: readonly string[];
  answerIndex: number;
}

/** Every options/answerIndex pair: vocab, translation_choice, reading questions, placement. */
function optionSets(files: readonly LoadedFile[]): OptionSet[] {
  const out: OptionSet[] = [];
  for (const { file, path, exercise } of exerciseEntries(files)) {
    if (exercise.type === "vocab" || exercise.type === "translation_choice") {
      out.push({ file, path, options: exercise.options, answerIndex: exercise.answerIndex });
    } else if (exercise.type === "reading") {
      exercise.questions.forEach((q, i) =>
        out.push({
          file,
          path: `${path}.questions[${i}]`,
          options: q.options,
          answerIndex: q.answerIndex,
        }),
      );
    }
  }
  return out;
}

export const validateAnswerIndexes: Rule = (files: readonly LoadedFile[]) =>
  optionSets(files).flatMap<ValidationError>((s) =>
    s.answerIndex >= s.options.length
      ? [
          {
            file: s.file,
            path: `${s.path}.answerIndex`,
            message: `answerIndex ${s.answerIndex} is out of range for ${s.options.length} options`,
          },
        ]
      : [],
  );

export const validateOptionDuplicates: Rule = (files: readonly LoadedFile[]) => {
  const errors: ValidationError[] = [];
  for (const s of optionSets(files)) {
    const seen = new Set<string>();
    s.options.forEach((opt, i) => {
      const key = normalize(opt);
      if (seen.has(key)) {
        errors.push({
          file: s.file,
          path: `${s.path}.options[${i}]`,
          message: `duplicate option "${opt}" (normalized)`,
        });
      }
      seen.add(key);
    });
  }
  return errors;
};
