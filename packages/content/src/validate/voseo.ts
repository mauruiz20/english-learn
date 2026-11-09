import type { LoadedFile, Rule, ValidationError } from "./types";

/**
 * Voseo detection. The app and its content speak neutral Spanish with tú ("inicia", "puedes",
 * "tienes"), never voseo ("iniciá", "podés", "tenés"). Spanish has no lexicon here, so this
 * catches the common shapes and keeps false positives low rather than catching every form:
 *
 * - present tense, stress on a final "-ás / -és / -ís" ("podés", "tenés", "usás", "creás"),
 *   except future tú ("verás", "perderás": "-rás") and the nouns and adverbs listed below;
 * - first-conjugation imperatives ending in "-á" ("iniciá", "tocá", "revisá"), except the future
 *   ("será", "abrirá": "-rá") and the words listed below;
 * - a list of other imperatives ("hacé", "decí", "abrí"…), imperatives with a pronoun ("usalo",
 *   "fijate") and "vos" / "sos".
 *
 * Regular "-ir" imperatives ("abrí", "elegí") are also the first person past ("abrí la puerta":
 * I opened the door), common in content sentences; `allowFirstPersonPreterite` skips them.
 */

const PRESENT_EXCEPTIONS = new Set([
  "además",
  "atrás",
  "compás",
  "demás",
  "detrás",
  "estás",
  "jamás",
  "quizás",
  "andrés",
  "bebés",
  "cafés",
  "cortés",
  "descortés",
  "después",
  "escocés",
  "estés",
  "estrés",
  "francés",
  "holandés",
  "inglés",
  "interés",
  "irlandés",
  "japonés",
  "marqués",
  "mamás",
  "papás",
  "portugués",
  "revés",
  "sofás",
  "través",
  "anís",
  "país",
  // Names.
  "inés",
  "moisés",
  "nicolás",
  "parís",
  "tomás",
]);

const IMPERATIVE_EXCEPTIONS = new Set([
  "acá",
  "allá",
  "bogotá",
  "canadá",
  "está",
  "mamá",
  "ojalá",
  "panamá",
  "papá",
  "quizá",
  "sofá",
]);

/** Voseo forms the shapes above miss (or exclude, as "-rá" imperatives). */
const LISTED = new Set([
  "vos",
  "sos",
  // "-rá" imperatives (the shape rule leaves "-rá" to the future).
  "comprá",
  "mirá",
  "pará",
  "prepará",
  "compará",
  "separá",
  // Second and irregular conjugations: never a first person past.
  "aprendé",
  "corré",
  "decí",
  "escogé",
  "hacé",
  "leé",
  "mové",
  "poné",
  "respondé",
  "tené",
  "vení",
  "volvé",
  // With a pronoun, voseo drops the tú accent ("úsalo", "fíjate").
  "acordate",
  "avisame",
  "ayudame",
  "contame",
  "decime",
  "dejame",
  "elegilo",
  "fijate",
  "guardalo",
  "hacelo",
  "intentalo",
  "mirala",
  "miralo",
  "mostrame",
  "olvidate",
  "probalo",
  "quedate",
  "revisalo",
  "tocalo",
  "usala",
  "usalo",
]);

/** Regular "-ir" imperatives that equal the first person past. */
const IR_IMPERATIVES = new Set([
  "abrí",
  "compartí",
  "elegí",
  "escribí",
  "permití",
  "pedí",
  "recibí",
  "repetí",
  "salí",
  "seguí",
  "subí",
  "viví",
]);

export interface VoseoOptions {
  /** Skip the "-ir" imperatives that are also the first person past ("abrí", "pedí"). */
  readonly allowFirstPersonPreterite?: boolean;
}

function isVoseo(word: string, options: VoseoOptions): boolean {
  if (word === "SOS") return false;
  const w = word.toLowerCase();
  if (LISTED.has(w)) return true;
  if (IR_IMPERATIVES.has(w)) return !options.allowFirstPersonPreterite;
  if (w.length < 4) return false;
  if (/[áéí]s$/.test(w)) return !w.endsWith("rás") && !PRESENT_EXCEPTIONS.has(w);
  if (w.endsWith("á")) return !w.endsWith("rá") && !IMPERATIVE_EXCEPTIONS.has(w);
  return false;
}

/** The voseo words in `text`, as written, in order. */
export function findVoseo(text: string, options: VoseoOptions = {}): string[] {
  return [...text.matchAll(/\p{L}+/gu)].map((m) => m[0]).filter((w) => isVoseo(w, options));
}

/** Every string inside `value` with its `a[0].b` path. */
function* strings(value: unknown, path: string): Generator<[string, string]> {
  if (typeof value === "string") {
    yield [path, value];
  } else if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) yield* strings(value[i], `${path}[${i}]`);
  } else if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) yield* strings(v, path ? `${path}.${k}` : k);
  }
}

/**
 * Rejects voseo in every text field. Content sentences may say "pedí" or "abrí" as the first
 * person past, so those are allowed here.
 */
export const validateNeutralSpanish: Rule = (files: readonly LoadedFile[]) => {
  const errors: ValidationError[] = [];
  for (const { file, data } of files) {
    for (const [path, text] of strings(data, "")) {
      const found = findVoseo(text, { allowFirstPersonPreterite: true });
      if (found.length > 0) {
        const quoted = found.map((w) => `"${w}"`).join(", ");
        errors.push({
          file,
          path,
          message: `voseo (${quoted}); content Spanish uses tú forms (mira, puedes, inicia)`,
        });
      }
    }
  }
  return errors;
};
