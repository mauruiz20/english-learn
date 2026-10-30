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
