import { describe, expect, it } from "vitest";
import type { ContentFile, GlossaryEntry } from "../schema";
import * as fx from "../testing/fixtures";
import {
  findUncoveredWords,
  glossaryReport,
  glossaryTexts,
  validateCorpus,
  validateGlossaryCoverage,
  validateGlossaryEntries,
  validateGlossaryForms,
  type LoadedFile,
} from "./index";

const file = (data: ContentFile, name = "b1/travel.json"): LoadedFile => ({ file: name, data });
const gfile = (glossary: GlossaryEntry[], name = "glossary/a.json"): LoadedFile =>
  file({ glossary }, name);
const word = (headword: string, forms: string[] = [headword.toLowerCase()]): GlossaryEntry =>
  fx.glossaryEntry({
    id: `glossary.${headword.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    headword,
    forms,
  });

describe("validateGlossaryEntries", () => {
  it("passes for the fixture glossary", () => {
    expect(validateGlossaryEntries(fx.glossaryFiles())).toEqual([]);
  });

  it("requires glossary files to be named glossary/<letter>.json", () => {
    const errs = validateGlossaryEntries([gfile([word("about")], "glossary/misc.json")]);
    expect(errs).toEqual([
      {
        file: "glossary/misc.json",
        path: "(root)",
        message: "glossary files must be named glossary/<letter>.json (a-z)",
      },
    ]);
  });

  it("requires every headword to start with the file letter", () => {
    const errs = validateGlossaryEntries([gfile([word("about"), word("best")])]);
    expect(errs).toEqual([
      {
        file: "glossary/a.json",
        path: "glossary[1].headword",
        message: 'headword "best" belongs in glossary/b.json',
      },
    ]);
  });

  it("requires entries sorted by headword", () => {
    const errs = validateGlossaryEntries([gfile([word("apple"), word("about")])]);
    expect(errs).toEqual([
      {
        file: "glossary/a.json",
        path: "glossary[1].headword",
        message: 'entries must be sorted by headword: "about" comes before "apple"',
      },
    ]);
  });

  it("requires lowercase, straight-apostrophe forms with single spaces", () => {
    const errs = validateGlossaryEntries([
      gfile([word("aren't", ["aren't", "Aren't", "aren’t", "are  not", "a.b", "a/b"])]),
    ]);
    expect(errs.map((e) => [e.path, e.message])).toEqual([
      ["glossary[0].forms[1]", 'form "Aren\'t" must be lowercase with straight apostrophes'],
      ["glossary[0].forms[2]", 'form "aren’t" must be lowercase with straight apostrophes'],
      ["glossary[0].forms[3]", 'form "are  not" must be words separated by single spaces'],
      ["glossary[0].forms[4]", 'form "a.b" must be words separated by single spaces'],
      ["glossary[0].forms[5]", 'form "a/b" must be words separated by single spaces'],
    ]);
  });

  it("accepts dotted abbreviations and hyphenated forms", () => {
    expect(validateGlossaryEntries([gfile([word("a.m.", ["a.m."]), word("all-day")])])).toEqual([]);
  });

  it("requires the headword among the forms and no duplicate forms", () => {
    const errs = validateGlossaryEntries([gfile([word("Apple", ["apples", "apples"])])]);
    expect(errs.map((e) => [e.path, e.message])).toEqual([
      ["glossary[0].forms", 'forms must include the headword "apple"'],
      ["glossary[0].forms[1]", 'duplicate form "apples"'],
    ]);
  });

  it("requires single-word forms for words and multi-word forms for phrases", () => {
    const errs = validateGlossaryEntries([
      gfile([
        fx.glossaryEntry({
          id: "glossary.after",
          headword: "after",
          forms: ["after", "after all"],
        }),
        fx.glossaryEntry({
          id: "glossary.after-all",
          headword: "after all",
          kind: "phrase",
          forms: ["after all", "afterall"],
        }),
      ]),
    ]);
    expect(errs.map((e) => [e.path, e.message])).toEqual([
      ["glossary[0].forms[1]", 'a word entry cannot have the multi-word form "after all"'],
      ["glossary[1].forms[1]", 'a phrase entry needs multi-word forms, not "afterall"'],
    ]);
  });
});

describe("validateGlossaryForms", () => {
  it("passes for the fixture glossary", () => {
    expect(validateGlossaryForms(fx.glossaryFiles())).toEqual([]);
  });

  it("flags a form claimed by two entries, across files", () => {
    const errs = validateGlossaryForms([
      gfile([word("about"), word("as", ["as", "about"])]),
      gfile([word("by", ["by", "as"])], "glossary/b.json"),
    ]);
    expect(errs).toEqual([
      {
        file: "glossary/a.json",
        path: "glossary[1].forms[1]",
        message:
          'form "about" already belongs to glossary.about (glossary/a.json); merge the senses into one entry',
      },
      {
        file: "glossary/b.json",
        path: "glossary[0].forms[1]",
        message:
          'form "as" already belongs to glossary.as (glossary/a.json); merge the senses into one entry',
      },
    ]);
  });

  it("flags duplicate glossary ids", () => {
    const errs = validateGlossaryForms([gfile([word("about"), word("about", ["abouts"])])]);
    expect(errs).toEqual([
      {
        file: "glossary/a.json",
        path: "glossary[1].id",
        message: 'duplicate glossary id "glossary.about" (first in glossary/a.json)',
      },
    ]);
  });
});

describe("glossaryTexts", () => {
  it("lists learner-visible English text and skips Spanish fields", () => {
    const texts = glossaryTexts([
      file({ ...fx.validFile(), placement: [fx.placementQuestion()] }),
    ]).map((t) => t.path);
    expect(texts).toEqual([
      "items[0].term",
      "exercises[0].prompt",
      "exercises[1].sentence",
      "exercises[1].answers[0]",
      "exercises[1].distractors[0]",
      "exercises[1].distractors[1]",
      "exercises[2].tokens",
      "exercises[2].accepted[0]",
      "exercises[3].sentence",
      "exercises[4].accepted[0]",
      "exercises[5].questions[0].prompt",
      "exercises[5].questions[0].options[0]",
      "exercises[5].questions[0].options[1]",
      "exercises[5].questions[0].options[2]",
      "passages[0].title",
      "passages[0].text",
      "placement[0].exercise.prompt",
    ]);
  });

  it("skips the quoted Spanish term of a 'Choose the English for' prompt", () => {
    const [prompt] = glossaryTexts([
      file({ exercises: [fx.vocab({ prompt: "Choose the English for 'sala de estar'." })] }),
    ]);
    expect(prompt?.text).toBe("Choose the English for");
  });

  it("joins word-order tokens with spaces", () => {
    const [tokens] = glossaryTexts([file({ exercises: [fx.wordOrder()] })]);
    expect(tokens?.text).toBe("although we rained. went it out");
  });
});

describe("validateGlossaryCoverage", () => {
  const corpus = () => [file(fx.validFile()), ...fx.glossaryFiles()];

  it("passes when every word resolves", () => {
    expect(validateGlossaryCoverage(corpus())).toEqual([]);
  });

  it("reports each uncovered word once per text, with file and path", () => {
    const errs = validateGlossaryCoverage([
      file({ passages: [fx.passage({ text: "We saw zebras and zebras near Lisbon." })] }),
      ...fx.glossaryFiles(),
    ]);
    expect(errs).toEqual([
      {
        file: "b1/travel.json",
        path: "passages[0].text",
        message: 'word "saw" has no glossary entry',
      },
      {
        file: "b1/travel.json",
        path: "passages[0].text",
        message: 'word "zebras" has no glossary entry',
      },
      {
        file: "b1/travel.json",
        path: "passages[0].text",
        message: 'word "and" has no glossary entry',
      },
      {
        file: "b1/travel.json",
        path: "passages[0].text",
        message: 'word "near" has no glossary entry',
      },
    ]);
  });

  it("reports an uncovered word once per answer pattern, not once per expansion", () => {
    const exercise = fx.translateWrite({
      accepted: ["{Although|Though} he was tired, he saw it."],
    });
    const errs = validateGlossaryCoverage([file({ exercises: [exercise] }), ...fx.glossaryFiles()]);
    expect(errs.filter((e) => e.message === 'word "saw" has no glossary entry')).toEqual([
      {
        file: "b1/travel.json",
        path: "exercises[0].accepted[0]",
        message: 'word "saw" has no glossary entry',
      },
    ]);
  });

  it("counts words inside a matched phrase as covered", () => {
    const glossary = [
      ...fx.glossaryFiles(),
      gfile(
        [fx.glossaryEntry({ id: "glossary.x-y", headword: "x y", kind: "phrase", forms: ["x y"] })],
        "glossary/x.json",
      ),
    ];
    const text = file({ passages: [fx.passage({ text: "We went x y." })] });
    expect(validateGlossaryCoverage([text, ...glossary])).toEqual([]);
  });

  it("is part of validateCorpus", () => {
    expect(validateCorpus(corpus())).toEqual([]);
    expect(validateCorpus([file(fx.validFile())]).length).toBeGreaterThan(0);
  });

  it("finds uncovered words with their text for the gaps script", () => {
    const found = findUncoveredWords([
      file({ passages: [fx.passage({ text: "We saw Lisbon." })] }),
      ...fx.glossaryFiles(),
    ]);
    expect(found).toEqual([
      { file: "b1/travel.json", path: "passages[0].text", text: "We saw Lisbon.", word: "saw" },
    ]);
  });
});

describe("glossaryReport", () => {
  it("counts entries, phrases and forms and lists unused forms", () => {
    const report = glossaryReport([file(fx.validFile()), ...fx.glossaryFiles()]);
    expect(report.entries).toBe(32);
    expect(report.phrases).toBe(1);
    expect(report.forms).toBe(40);
    expect(report.unusedForms).toEqual(["be", "do", "go out", "keep", "rain", "walk"]);
  });
});
