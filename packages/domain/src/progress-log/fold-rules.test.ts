import { readFileSync, writeFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { describe, expect, it } from "vitest";
import { FOLD_SNAPSHOT_VERSION, foldSnapshot } from "./fold";
import { FOLD_RULES_CORPUS, foldRulesFingerprint } from "./fold-rules";

const GOLDEN = new URL("./fold-rules.golden.json", import.meta.url);

type Golden = {
  readonly version: number;
  readonly fingerprint: string;
  readonly snapshot: unknown;
};

/** What the fold gives for the corpus today, as it would be stored (through JSON). */
function current(): Golden {
  return JSON.parse(
    JSON.stringify({
      version: FOLD_SNAPSHOT_VERSION,
      fingerprint: foldRulesFingerprint(),
      snapshot: foldSnapshot(FOLD_RULES_CORPUS),
    }),
  ) as Golden;
}

describe("fold rules golden (stored snapshots depend on them)", () => {
  if (process.env.UPDATE_FOLD_GOLDEN === "1")
    writeFileSync(GOLDEN, `${JSON.stringify(current(), null, 2)}\n`);

  it("folds the pinned corpus exactly as the golden of this FOLD_SNAPSHOT_VERSION", () => {
    const pinned = JSON.parse(readFileSync(GOLDEN, "utf8")) as Golden;
    const now = current();
    if (
      !isDeepStrictEqual(now.snapshot, pinned.snapshot) &&
      pinned.version === FOLD_SNAPSHOT_VERSION
    ) {
      throw new Error(
        `The fold's output changed but FOLD_SNAPSHOT_VERSION is still ${FOLD_SNAPSHOT_VERSION}. ` +
          "Stored snapshots would keep the old rules: bump FOLD_SNAPSHOT_VERSION in " +
          "packages/domain/src/progress-log/fold.ts, then regenerate the golden with " +
          "`UPDATE_FOLD_GOLDEN=1 pnpm --filter @english-learn/domain test fold-rules`.",
      );
    }
    if (pinned.version !== FOLD_SNAPSHOT_VERSION) {
      throw new Error(
        `The golden is pinned for FOLD_SNAPSHOT_VERSION ${pinned.version}, not ` +
          `${FOLD_SNAPSHOT_VERSION}: regenerate it with ` +
          "`UPDATE_FOLD_GOLDEN=1 pnpm --filter @english-learn/domain test fold-rules`.",
      );
    }
    expect(now).toEqual(pinned);
  });

  it("exercises every rule: each event type, every anomaly kind, bonuses and baselines", () => {
    const snapshot = foldSnapshot(FOLD_RULES_CORPUS);
    const kinds = new Set(
      [...snapshot.envelopeAnomalies, ...snapshot.anomalies].map((anomaly) => anomaly.kind),
    );
    expect([...kinds].sort()).toEqual([
      "conflicting_duplicate",
      "duplicate_item_review",
      "duplicate_session",
      "invalid_event",
      "unsupported_event",
    ]);
    expect(new Set(FOLD_RULES_CORPUS.map((event) => event.type))).toEqual(
      new Set([
        "baseline_imported",
        "item_reviewed",
        "session_completed",
        "placement_completed",
        "answer_disputed",
        "item_purchased",
        "item_equipped",
        "streak_frozen",
      ]),
    );
    expect(snapshot.lessonResults.length).toBeGreaterThan(1);
    expect(snapshot.states.length).toBeGreaterThan(3);
  });

  it("ignores the retired wardrobe types, well-formed or not, without reporting them", () => {
    const snapshot = foldSnapshot(FOLD_RULES_CORPUS);
    const retiredIds = FOLD_RULES_CORPUS.filter((event) =>
      ["item_purchased", "item_equipped"].includes(event.type),
    ).map((event) => event.id);
    expect(retiredIds.length).toBeGreaterThanOrEqual(3);
    const reported = [...snapshot.envelopeAnomalies, ...snapshot.anomalies].map((a) => a.eventId);
    for (const id of retiredIds) expect(reported).not.toContain(id);
    const withoutRetired = FOLD_RULES_CORPUS.filter((event) => !retiredIds.includes(event.id));
    expect({ ...snapshot, cursor: null }).toEqual({
      ...foldSnapshot(withoutRetired),
      cursor: null,
    });
  });

  it("has a fingerprint naming the version and hashing the corpus output", () => {
    expect(foldRulesFingerprint()).toMatch(new RegExp(`^v${FOLD_SNAPSHOT_VERSION}-[0-9a-f]{8}$`));
    expect(foldRulesFingerprint()).toBe(foldRulesFingerprint());
  });
});
