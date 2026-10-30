import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fx from "../src/testing/fixtures";
import { buildCorpus, renderCorpusModule } from "./build-corpus";

let root: string;
let dataDir: string;
let outFile: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "corpus-"));
  dataDir = join(root, "data");
  outFile = join(root, "src", "generated", "corpus.ts");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function write(rel: string, value: unknown): void {
  const p = join(dataDir, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(value));
}

describe("renderCorpusModule", () => {
  it("is deterministic: the same files in any order give the same module", async () => {
    const a = await renderCorpusModule(["b1/travel.json", "a2/routine.json"], "../../data");
    const b = await renderCorpusModule(["a2/routine.json", "b1/travel.json"], "../../data");

    expect(a).toBe(b);
  });

  it("statically imports every file, sorted by path", async () => {
    const source = await renderCorpusModule(
      ["placement/seed.json", "b1/travel.json", "a2/routine.json"],
      "../../data",
    );

    const imports = [...source.matchAll(/^import (\w+) from "(.+\.json)";$/gm)].map((m) => [
      m[1],
      m[2],
    ]);
    expect(imports).toEqual([
      ["file0", "../../data/a2/routine.json"],
      ["file1", "../../data/b1/travel.json"],
      ["file2", "../../data/placement/seed.json"],
    ]);
    expect(source).toContain("createCorpus(files)");
    expect(source).not.toMatch(/from "zod"/);
  });
});

describe("buildCorpus", () => {
  it("writes the module, then reports it as up to date", async () => {
    write("b1/travel.json", fx.validFile());

    expect(await buildCorpus({ dataDir, outFile, mode: "write" })).toEqual({ status: "written" });
    expect(readFileSync(outFile, "utf8")).toContain('"../../data/b1/travel.json"');
    expect(await buildCorpus({ dataDir, outFile, mode: "check" })).toEqual({
      status: "up-to-date",
    });
  });

  it("detects a stale module when a data file is added", async () => {
    write("b1/travel.json", fx.validFile());
    await buildCorpus({ dataDir, outFile, mode: "write" });

    write("b1/empty.json", {});

    expect(await buildCorpus({ dataDir, outFile, mode: "check" })).toEqual({ status: "stale" });
  });

  it("detects a hand-edited or missing module", async () => {
    write("b1/travel.json", fx.validFile());
    expect(await buildCorpus({ dataDir, outFile, mode: "check" })).toEqual({ status: "stale" });

    await buildCorpus({ dataDir, outFile, mode: "write" });
    writeFileSync(outFile, readFileSync(outFile, "utf8") + "\n// edited\n");

    expect(await buildCorpus({ dataDir, outFile, mode: "check" })).toEqual({ status: "stale" });
  });

  it("refuses to generate from invalid content", async () => {
    write("b1/bad.json", { items: [{ id: "nope" }] });

    const result = await buildCorpus({ dataDir, outFile, mode: "write" });

    expect(result.status).toBe("invalid");
    expect(existsSync(outFile)).toBe(false);
  });

  it("the committed generated corpus is up to date", async () => {
    expect(await buildCorpus({ mode: "check" })).toEqual({ status: "up-to-date" });
  });
});
