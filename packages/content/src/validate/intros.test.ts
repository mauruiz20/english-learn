import { describe, expect, it } from "vitest";
import type { ContentFile } from "../schema";
import * as fx from "../testing/fixtures";
import {
  findVoseo,
  validateCorpus,
  validateIntros,
  validateSchema,
  type LoadedFile,
} from "./index";

const file = (data: ContentFile, name = "b1/travel.json"): LoadedFile => ({ file: name, data });

/** `validFile()` whose lesson has `intro`. */
function withIntro(intro: ReturnType<typeof fx.lessonIntro>): ContentFile {
  return { ...fx.validFile(), lessons: [fx.lesson({ intro })] };
}

describe("validateSchema for level.json", () => {
  it("reads <level>/level.json as a level intro", () => {
    const result = validateSchema("b1/level.json", fx.levelIntro());
    expect(result.errors).toEqual([]);
    expect(result.data).toEqual({ levelIntro: fx.levelIntro() });
  });

  it("reports level intro errors at the file's own paths", () => {
    const result = validateSchema("b1/level.json", { ...fx.levelIntro(), canDo: ["Uno."] });
    expect(result.data).toBeUndefined();
    expect(result.errors.map((e) => e.path)).toEqual(["canDo"]);
  });

  it("never reads another file as a level intro", () => {
    expect(validateSchema("b1/travel.json", fx.levelIntro()).errors).not.toEqual([]);
    expect(validateSchema("glossary/level.json", fx.levelIntro()).errors).not.toEqual([]);
  });
});

describe("validateIntros", () => {
  it("accepts a lesson intro and a level intro in its directory", () => {
    expect(
      validateIntros([
        file(withIntro(fx.lessonIntro())),
        file({ levelIntro: fx.levelIntro() }, "b1/level.json"),
      ]),
    ).toEqual([]);
  });

  it("reports a mistake whose wrong and right sentences are the same", () => {
    const intro = fx.lessonIntro({
      mistake: { wrong: "We went out.", right: "we went out", note: "Igual." },
    });
    expect(validateIntros([file(withIntro(intro))])).toEqual([
      {
        file: "b1/travel.json",
        path: "lessons[0].intro.mistake",
        message: 'the mistake\'s "wrong" and "right" are the same sentence (normalized)',
      },
    ]);
  });

  it("reports a level intro outside its level's level.json", () => {
    expect(validateIntros([file({ levelIntro: fx.levelIntro() }, "a2/level.json")])).toEqual([
      {
        file: "a2/level.json",
        path: "level",
        message: "level B1 does not match directory level A2",
      },
    ]);
    expect(validateIntros([file({ levelIntro: fx.levelIntro() }, "b1/travel.json")])).toEqual([
      {
        file: "b1/travel.json",
        path: "levelIntro",
        message: "a level intro lives in <level>/level.json",
      },
    ]);
  });
});

describe("intros in the whole corpus", () => {
  const corpus = (data: ContentFile, extra: LoadedFile[] = []) =>
    validateCorpus([file(data), ...extra, ...fx.glossaryFiles()]);

  it("passes with a covered intro and a level intro", () => {
    expect(
      corpus(withIntro(fx.lessonIntro()), [file({ levelIntro: fx.levelIntro() }, "b1/level.json")]),
    ).toEqual([]);
  });

  it("checks the English of the examples and the correction against the glossary", () => {
    const intro = fx.lessonIntro({
      examples: [{ en: "We went home.", es: "Fuimos a casa." }],
      mistake: { wrong: "We goed out.", right: "We went outside.", note: "«Go» es irregular." },
    });
    expect(corpus(withIntro(intro))).toEqual([
      {
        file: "b1/travel.json",
        path: "lessons[0].intro.examples[0].en",
        message: 'word "home" has no glossary entry',
      },
      {
        file: "b1/travel.json",
        path: "lessons[0].intro.mistake.right",
        message: 'word "outside" has no glossary entry',
      },
    ]);
  });

  it("rejects voseo in intros and level intros", () => {
    const intro = fx.lessonIntro({ points: ["Mirá el orden.", "Usalo siempre."] });
    const errors = corpus(withIntro(intro), [
      file(
        { levelIntro: fx.levelIntro({ canDo: ["Podés viajar.", "Dos.", "Tres."] }) },
        "b1/level.json",
      ),
    ]);
    expect(errors.map((e) => `${e.file} ${e.path}`)).toEqual([
      "b1/travel.json lessons[0].intro.points[0]",
      "b1/travel.json lessons[0].intro.points[1]",
      "b1/level.json levelIntro.canDo[0]",
    ]);
    expect(findVoseo("Puedes viajar.")).toEqual([]);
  });
});
