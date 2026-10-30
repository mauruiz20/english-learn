import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fx from "../src/testing/fixtures";
import { formatErrors, main, run } from "./validate";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "content-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function write(rel: string, value: unknown): void {
  const p = join(dir, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, typeof value === "string" ? value : JSON.stringify(value));
}

describe("main(dir)", () => {
  it("returns no errors for a valid corpus", () => {
    write("b1/travel.json", fx.validFile());
    expect(main(dir)).toEqual([]);
  });

  it("reports semantic errors with file, path and message", () => {
    const f = fx.validFile();
    write("b1/travel.json", {
      ...f,
      exercises: [fx.vocab({ answerIndex: 9 }), ...(f.exercises ?? []).slice(1)],
    });
    const errs = main(dir);
    expect(errs).toContainEqual(
      expect.objectContaining({ file: "b1/travel.json", path: "exercises[0].answerIndex" }),
    );
  });

  it("reports schema errors and still never throws", () => {
    write("b1/bad.json", { items: [{ id: "nope" }] });
    const errs = main(dir);
    expect(errs.length).toBeGreaterThan(0);
    expect(errs.every((e) => e.file === "b1/bad.json")).toBe(true);
  });

  it("reports malformed JSON syntax as an error", () => {
    write("b1/broken.json", "{ not json");
    const errs = main(dir);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatchObject({ file: "b1/broken.json", path: "(root)" });
  });

  it("reports duplicate JSON keys that JSON.parse would silently drop", () => {
    const text = JSON.stringify(fx.validFile()).replace(
      '"term":"although"',
      '"term":"aunque","term":"although"',
    );
    write("b1/travel.json", text);
    expect(main(dir)).toEqual([
      {
        file: "b1/travel.json",
        path: "items[0].term",
        message: 'duplicate key "term" (JSON.parse keeps only the last value)',
      },
    ]);
  });

  it("still runs reference-free rules on parsed files when another file fails the schema", () => {
    const f = fx.validFile();
    write("b1/bad.json", { items: [{ id: "nope" }] });
    write("b1/travel.json", {
      ...f,
      items: [],
      exercises: [fx.cloze({ sentence: "____ it was raining, we went out." })],
      lessons: [],
    });
    const errs = main(dir);
    expect(errs.filter((e) => e.file === "b1/bad.json").length).toBeGreaterThan(0);
    // The cloze rule ran; cross-file rules (e.g. unknown item id) stayed gated.
    expect(errs.filter((e) => e.file === "b1/travel.json")).toEqual([
      {
        file: "b1/travel.json",
        path: "exercises[0].sentence",
        message: 'cloze sentence must contain exactly one blank written as "___" (found "____")',
      },
    ]);
  });

  it("rejects a content file at the data root", () => {
    write("b1/travel.json", fx.validFile());
    write("x.json", { items: [fx.item({ id: "a2.travel.x", level: "A2" })] });
    expect(main(dir)).toEqual([
      {
        file: "x.json",
        path: "(root)",
        message:
          'content files must live in data/<a1|a2|b1|b2|c1|placement>/; "x.json" is at the root',
      },
    ]);
  });

  it("reports a missing directory and an empty corpus", () => {
    expect(main(join(dir, "missing"))).toHaveLength(1);
    expect(main(dir)).toHaveLength(1);
  });

  it("validates references across files", () => {
    const f = fx.validFile();
    write("b1/items.json", { items: f.items });
    write("b1/rest.json", { ...f, items: undefined });
    expect(main(dir)).toEqual([]);
  });
});

describe("run(dir) / formatErrors", () => {
  it("exits 0 for a valid corpus and 1 for a broken one", () => {
    write("b1/travel.json", fx.validFile());
    expect(run(dir, () => {}).code).toBe(0);
    write("b1/travel.json", { ...fx.validFile(), exercises: [fx.vocab({ answerIndex: 9 })] });
    const lines: string[] = [];
    expect(run(dir, (l) => lines.push(l)).code).toBe(1);
    expect(lines.join("\n")).toContain("b1/travel.json");
  });

  it("formats one readable line per error", () => {
    const out = formatErrors([{ file: "a2/x.json", path: "items[0].id", message: "boom" }]);
    expect(out).toBe("a2/x.json  items[0].id  boom");
  });
});

describe("real corpus", () => {
  it("data/ validates", () => {
    const data = join(dirname(fileURLToPath(import.meta.url)), "..", "data");
    expect(main(data)).toEqual([]);
  });
});
