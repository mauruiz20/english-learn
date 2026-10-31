import { describe, expect, it } from "vitest";
import * as fx from "../src/testing/fixtures";
import { disputedAnswers, formatDisputes, parseDisputes } from "./disputed-answers";

const dispute = (exerciseId: string, answer: string, extra: Record<string, unknown> = {}) => ({
  id: `e-${exerciseId}-${answer}`,
  deviceId: "d1",
  occurredAt: 1,
  localDate: "2026-10-31",
  type: "answer_disputed",
  payload: { v: 1, exerciseId, itemIds: ["b1.travel.although"], answer, accepted: false },
  ...extra,
});

describe("parseDisputes", () => {
  it("reads an array of events or an object with `events`, and keeps only disputes", () => {
    const events = [
      dispute("b1.travel.write-001", "Though he was tired, he walked on."),
      { ...dispute("x", "y"), type: "session_completed" },
    ];
    expect(parseDisputes(events)).toEqual([
      { exerciseId: "b1.travel.write-001", answer: "Though he was tired, he walked on." },
    ]);
    expect(parseDisputes({ events })).toHaveLength(1);
  });

  it("accepts payloads stored as JSON text and skips malformed ones", () => {
    const asText = {
      ...dispute("b1.travel.write-001", "a"),
      payload: JSON.stringify(dispute("b1.travel.write-001", "a").payload),
    };
    const broken = { ...dispute("b1.travel.write-001", "b"), payload: "{oops" };
    const noAnswer = { ...dispute("b1.travel.write-001", "c"), payload: { exerciseId: "z" } };
    expect(parseDisputes([asText, broken, noAnswer, 42])).toEqual([
      { exerciseId: "b1.travel.write-001", answer: "a" },
    ]);
  });

  it("rejects input that holds no list of events", () => {
    expect(() => parseDisputes({ nope: true })).toThrow("expected an array of events");
  });
});

describe("disputedAnswers", () => {
  const exercise = fx.translateWrite({
    id: "b1.travel.write-001",
    accepted: ["{Although|Though} he was tired, he kept walking."],
  });

  it("groups answers by exercise (most disputed first) and counts repeated answers", () => {
    const groups = disputedAnswers(
      [
        { exerciseId: "b1.travel.write-002", answer: "x" },
        { exerciseId: "b1.travel.write-001", answer: "He kept walking although tired." },
        { exerciseId: "b1.travel.write-001", answer: "he kept walking although tired" },
        { exerciseId: "b1.travel.write-001", answer: "Though he was tired, he kept walking." },
      ],
      [exercise],
    );

    expect(groups).toEqual([
      {
        exerciseId: "b1.travel.write-001",
        es: exercise.es,
        reference: "Although he was tired, he kept walking.",
        total: 3,
        answers: [
          { answer: "He kept walking although tired.", count: 2, nowAccepted: false },
          { answer: "Though he was tired, he kept walking.", count: 1, nowAccepted: true },
        ],
      },
      {
        exerciseId: "b1.travel.write-002",
        es: null,
        reference: null,
        total: 1,
        answers: [{ answer: "x", count: 1, nowAccepted: false }],
      },
    ]);
  });

  it("formats a readable report", () => {
    const text = formatDisputes(
      disputedAnswers([{ exerciseId: "b1.travel.write-001", answer: "He went on." }], [exercise]),
    );
    expect(text).toContain("b1.travel.write-001 (1)");
    expect(text).toContain(`ES: ${exercise.es}`);
    expect(text).toContain("Ref: Although he was tired, he kept walking.");
    expect(text).toContain("  1× He went on.");
    expect(text).toContain("1 disputed answer(s) in 1 exercise(s)");
  });
});
