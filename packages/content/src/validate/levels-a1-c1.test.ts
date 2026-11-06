import { describe, expect, it } from "vitest";
import * as fx from "../testing/fixtures";
import { validateCorpus, type LoadedFile } from "./index";

/** The B1 fixtures moved to another level: ids, levels and directories. */
function atLevel(files: readonly LoadedFile[], level: "A1" | "C1"): LoadedFile[] {
  const slug = level.toLowerCase();
  return files.map(({ file, data }) => ({
    file: file.replace(/^b1\//, `${slug}/`),
    data: JSON.parse(
      JSON.stringify(data).replace(/"b1\./g, `"${slug}.`).replace(/"B1"/g, `"${level}"`),
    ) as LoadedFile["data"],
  }));
}

const PATH_FILE: LoadedFile = { file: "b1/travel.json", data: fx.validFile() };

/** The lesson file with every lesson linking `cardId` (`deepenCardIds`). */
function linking({ file, data }: LoadedFile, cardId: string): LoadedFile {
  const lessons = (data.lessons ?? []).map((l) => ({ ...l, deepenCardIds: [cardId] }));
  return { file, data: { ...data, lessons } };
}

describe("A1 and C1 content", () => {
  it.each(["A1", "C1"] as const)(
    "accepts %s lessons, a study card they link and a practice group",
    (level) => {
      const files = atLevel(
        [linking(PATH_FILE, fx.card().id), fx.cardFile(), ...fx.practiceFiles()],
        level,
      );
      expect(files.map((f) => f.file)).toContain(`${level.toLowerCase()}/grammar.json`);
      expect(JSON.stringify(files)).not.toMatch(/"B1"|"b1\./);

      expect(validateCorpus([...files, ...fx.glossaryFiles()])).toEqual([]);
    },
  );

  it("never lets an A1 lesson link a card above A1", () => {
    const files = [linking(atLevel([PATH_FILE], "A1")[0]!, fx.card().id), fx.cardFile()];

    expect(validateCorpus([...files, ...fx.glossaryFiles()])).toContainEqual({
      file: "a1/travel.json",
      path: "lessons[0].deepenCardIds[0]",
      message: 'card "b1.grammar.although" is B1, above the lesson level A1',
    });
  });

  it("lets a C1 lesson link a card below C1", () => {
    const files = [linking(atLevel([PATH_FILE], "C1")[0]!, fx.card().id), fx.cardFile()];

    expect(validateCorpus([...files, ...fx.glossaryFiles()])).toEqual([]);
  });
});
