import type { LoadedFile, Rule, ValidationError } from "./types";

/** `<level>.<topic>.<slug>` -> `<topic>`. */
export const idTopic = (id: string): string => id.split(".")[1] ?? "";

/**
 * Topic consistency that needs only the file itself (no references resolved):
 * - `item.topics` and `passage.topics` include the topic segment of their id.
 * - A lesson's id topic segment equals `lesson.topic`.
 * - Every exercise id a lesson lists has the lesson's topic segment.
 */
export const validateTopics: Rule = (files: readonly LoadedFile[]) => {
  const errors: ValidationError[] = [];
  for (const { file, data } of files) {
    for (const kind of ["items", "passages"] as const) {
      (data[kind] ?? []).forEach((entity, i) => {
        const topic = idTopic(entity.id);
        if (!entity.topics.includes(topic)) {
          errors.push({
            file,
            path: `${kind}[${i}].topics`,
            message: `topics must include "${topic}", the topic segment of its id`,
          });
        }
      });
    }
    (data.lessons ?? []).forEach((lesson, i) => {
      const topic = idTopic(lesson.id);
      if (lesson.topic !== topic) {
        errors.push({
          file,
          path: `lessons[${i}].topic`,
          message: `lesson topic "${lesson.topic}" does not match the topic segment of its id "${topic}"`,
        });
      }
      lesson.exerciseIds.forEach((id, j) => {
        if (idTopic(id) !== lesson.topic) {
          errors.push({
            file,
            path: `lessons[${i}].exerciseIds[${j}]`,
            message: `exercise "${id}" is not in lesson topic "${lesson.topic}"`,
          });
        }
      });
    });
  }
  return errors;
};

/**
 * Cross-file: an exercise's id topic segment is a topic of at least one of the
 * items it references. Unknown item ids are left to validateReferences.
 */
export const validateExerciseTopics: Rule = (files: readonly LoadedFile[]) => {
  const itemTopics = new Map<string, readonly string[]>();
  for (const { data } of files) for (const it of data.items ?? []) itemTopics.set(it.id, it.topics);

  const errors: ValidationError[] = [];
  for (const { file, data } of files) {
    (data.exercises ?? []).forEach((ex, i) => {
      const known = ex.itemIds.filter((id) => itemTopics.has(id));
      if (known.length === 0) return;
      const topic = idTopic(ex.id);
      if (!known.some((id) => itemTopics.get(id)?.includes(topic))) {
        errors.push({
          file,
          path: `exercises[${i}].id`,
          message: `exercise topic "${topic}" is not a topic of any referenced item`,
        });
      }
    });
  }
  return errors;
};
