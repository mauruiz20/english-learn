import { numbered } from "./grade-exercise";

/** What the learner submitted for one exercise. Options are identified by text, not position. */
export type ExerciseResponse =
  /** vocab, cloze and translation_choice: the chosen option. */
  | { readonly kind: "choice"; readonly option: string }
  /** reading: the chosen option of each question, in question order. */
  | { readonly kind: "choices"; readonly options: readonly string[] }
  /** word_order: the tokens in the order the learner built them. */
  | { readonly kind: "tokens"; readonly tokens: readonly string[] }
  /** translate_write: the typed text. */
  | { readonly kind: "text"; readonly text: string };

/** The learner's answer as one line of text, to show it back with the feedback. */
export function responseText(response: ExerciseResponse): string {
  switch (response.kind) {
    case "choice":
      return response.option;
    case "choices":
      return numbered(response.options);
    case "tokens":
      return response.tokens.join(" ");
    case "text":
      return response.text.trim();
  }
}
