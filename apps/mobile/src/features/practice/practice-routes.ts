/** `/practica`: the collections of free practice. */
export const PRACTICE_PATH = "/practica";

/** A collection's groups (`/practica/phrasal-verbs`). */
export function practiceCollectionPath(slug: string): string {
  return `${PRACTICE_PATH}/${encodeURIComponent(slug)}`;
}

/** Practice lessons play through the path's lesson screen. */
export function practiceLessonPath(lessonId: string): string {
  return `/lesson/${encodeURIComponent(lessonId)}`;
}
