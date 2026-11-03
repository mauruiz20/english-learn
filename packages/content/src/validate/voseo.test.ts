import { describe, expect, it } from "vitest";
import * as fx from "../testing/fixtures";
import { validateLocal } from "./corpus";
import { findVoseo, validateNeutralSpanish } from "./voseo";

describe("findVoseo", () => {
  it.each([
    ["Por ahora podés guardar tu progreso.", ["podés"]],
    ["Iniciá sesión si tenés una cuenta.", ["Iniciá", "tenés"]],
    ["Revisá tu conexión e intentá de nuevo.", ["Revisá", "intentá"]],
    ["Guardá y sincronizá tu progreso", ["Guardá", "sincronizá"]],
    ["Guardá tu progreso y usalo en otros dispositivos.", ["Guardá", "usalo"]],
    ["Para confirmar que sos vos.", ["sos", "vos"]],
    ["Para guardarlo, abrí la app.", ["abrí"]],
    ["Si creás una cuenta, tocá «Eliminar».", ["creás", "tocá"]],
    ["Hacé la prueba y fijate el resultado.", ["Hacé", "fijate"]],
    ["Mirá, comprá dos.", ["Mirá", "comprá"]],
    ["¿Querés seguir?", ["Querés"]],
  ])("flags the voseo in %j", (text, found) => {
    expect(findVoseo(text)).toEqual(found);
  });

  it.each([
    "Inicia sesión si tienes una cuenta. Puedes guardar tu progreso.",
    "Revisa tu conexión e intenta de nuevo. Guarda y sincroniza tu progreso.",
    "Guarda tu progreso y úsalo en otros dispositivos. Para confirmar que eres tú.",
    "Fíjate: aquí, allí, así, sí, qué, más, además, atrás, después, inglés, país.",
    "Está a salvo. ¿Estás listo? Ojalá que estés bien. Mi mamá y mi papá. Un café.",
    "Verás tu nivel. Perderás lo que respondiste. Se abrirá sola. Sumará el progreso.",
    "El estrés, el interés, a través de, quizás. Compraré, iré, diré.",
    "París, Tomás, Nicolás, Andrés, Inés y Moisés viajan a Panamá.",
    "Send an SOS. The sun sets at seven.",
  ])("accepts neutral Spanish: %j", (text) => {
    expect(findVoseo(text)).toEqual([]);
  });

  it("allows first-person past forms that look like -ir imperatives when asked to", () => {
    const sentence = "Le pedí al mecánico que revisara los frenos y abrí la puerta.";
    expect(findVoseo(sentence, { allowFirstPersonPreterite: true })).toEqual([]);
    expect(findVoseo(sentence)).toEqual(["pedí", "abrí"]);
  });
});

describe("validateNeutralSpanish", () => {
  it("accepts a file in neutral Spanish", () => {
    expect(validateNeutralSpanish([{ file: "a2/x.json", data: fx.validFile() }])).toEqual([]);
  });

  it("reports voseo in any text field with its path", () => {
    const data = fx.validFile();
    const items = data.items ?? [];
    const item = { ...items[0]!, es: "Mirá, podés" };
    const errors = validateNeutralSpanish([
      { file: "a2/x.json", data: { ...data, items: [item, ...items.slice(1)] } },
    ]);
    expect(errors).toEqual([
      {
        file: "a2/x.json",
        path: "items[0].es",
        message: 'voseo ("Mirá", "podés"); content Spanish uses tú forms (mira, puedes, inicia)',
      },
    ]);
  });

  it("runs with the other local rules", () => {
    const data = fx.validFile();
    const items = data.items ?? [];
    const item = { ...items[0]!, es: "podés" };
    const errors = validateLocal([
      { file: "a2/x.json", data: { ...data, items: [item, ...items.slice(1)] } },
    ]);
    expect(errors.map((e) => e.path)).toContain("items[0].es");
  });
});
