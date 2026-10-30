/**
 * Content pipeline CLI.
 *
 *   pnpm --filter @english-learn/content-pipeline download
 *   pnpm --filter @english-learn/content-pipeline candidates [--level A2|B1] [--limit 60]
 *
 * Raw exports live in the git-ignored `.cache/` directory and are never committed.
 */
import { spawnSync } from "node:child_process";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { checkAttribution, exercisesOf } from "./attribution";
import { buildShortlist } from "./candidates";
import type { PipelineLevel } from "./filter";
import { buildPairs, parseLinkRow, parseSentenceRow, type Sentence } from "./tatoeba";
import { TOPIC_KEYWORDS } from "./topics";

const CACHE = join(dirname(fileURLToPath(import.meta.url)), "..", ".cache");
const BASE = "https://downloads.tatoeba.org/exports/per_language";

/** Official weekly per-language exports (see README for the license notes). */
export const EXPORTS = {
  eng: `${BASE}/eng/eng_sentences_detailed.tsv.bz2`,
  spa: `${BASE}/spa/spa_sentences_detailed.tsv.bz2`,
  links: `${BASE}/eng/eng-spa_links.tsv.bz2`,
} as const;

function cachePath(url: string): string {
  return join(CACHE, url.split("/").pop() ?? "export.bz2");
}

async function download(): Promise<void> {
  mkdirSync(CACHE, { recursive: true });
  for (const url of Object.values(EXPORTS)) {
    const target = cachePath(url);
    console.log(`downloading ${url}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    await writeFile(target, Buffer.from(await res.arrayBuffer()));
    const r = spawnSync("bzip2", ["-dkf", target], { stdio: "inherit" });
    if (r.status !== 0) throw new Error(`bzip2 failed for ${target}`);
  }
  console.log(`done: ${CACHE}`);
}

async function* lines(path: string): AsyncGenerator<string> {
  const rl = createInterface({ input: createReadStream(path, "utf8"), crlfDelay: Infinity });
  for await (const line of rl) yield line;
}

async function readSentences(path: string, keep: Set<number>): Promise<Sentence[]> {
  const out: Sentence[] = [];
  for await (const line of lines(path)) {
    const s = parseSentenceRow(line);
    if (s && keep.has(s.id)) out.push(s);
  }
  return out;
}

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
}

async function candidates(): Promise<void> {
  const level = arg("level", "A2") as PipelineLevel;
  if (level !== "A2" && level !== "B1") throw new Error("--level must be A2 or B1");
  const limit = Number(arg("limit", "60"));
  const tsv = (url: string) => cachePath(url).replace(/\.bz2$/, "");
  for (const url of Object.values(EXPORTS)) {
    if (!existsSync(tsv(url))) throw new Error(`missing ${tsv(url)}; run the download command`);
  }

  const links: [number, number][] = [];
  const linked = new Set<number>();
  for await (const line of lines(tsv(EXPORTS.links))) {
    const l = parseLinkRow(line);
    if (!l) continue;
    links.push(l);
    linked.add(l[0]).add(l[1]);
  }
  const eng = await readSentences(tsv(EXPORTS.eng), linked);
  const spa = await readSentences(tsv(EXPORTS.spa), linked);
  const shortlist = buildShortlist(buildPairs(eng, spa, links), TOPIC_KEYWORDS, level, limit);

  const out = join(CACHE, `candidates-${level.toLowerCase()}.json`);
  writeFileSync(out, `${JSON.stringify(shortlist, null, 2)}\n`);
  const counts = Object.entries(shortlist).map(([t, c]) => `${t}=${c.length}`);
  console.log(`wrote ${out} (${counts.join(", ")})`);
}

/** Checks every Tatoeba attribution in packages/content/data against the English export. */
async function verify(): Promise<void> {
  const dataDir = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "..",
    "packages",
    "content",
    "data",
  );
  const files = readdirSync(dataDir, { recursive: true, encoding: "utf8" }).filter((p) =>
    p.endsWith(".json"),
  );
  const exercises = files.flatMap((f) =>
    exercisesOf(JSON.parse(readFileSync(join(dataDir, f), "utf8"))),
  );
  const wanted = new Set<number>();
  for (const ex of exercises) {
    if (ex.source.kind === "tatoeba" && ex.source.sentenceId !== undefined)
      wanted.add(ex.source.sentenceId);
  }
  const engPath = cachePath(EXPORTS.eng).replace(/\.bz2$/, "");
  if (!existsSync(engPath)) throw new Error(`missing ${engPath}; run the download command`);
  const english = new Map((await readSentences(engPath, wanted)).map((s) => [s.id, s]));
  const errors = exercises.flatMap((ex) => checkAttribution(ex, english));
  for (const e of errors) console.error(`${e.id}: ${e.message}`);
  console.log(`${wanted.size} Tatoeba sentences checked, ${errors.length} error(s)`);
  if (errors.length > 0) process.exit(1);
}

const commands: Record<string, () => Promise<void>> = { download, candidates, verify };
const run = commands[process.argv[2] ?? ""];
if (!run) {
  console.error("usage: tsx src/cli.ts <download|candidates|verify> [--level A2|B1] [--limit N]");
  process.exit(1);
}
run().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
