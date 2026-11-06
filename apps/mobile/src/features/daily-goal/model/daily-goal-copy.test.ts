import { dailyGoalStatus } from "@english-learn/domain";
import {
  goalChoiceLabel,
  goalProgressLabel,
  goalProgressText,
  goalSummaryLine,
} from "./daily-goal-copy";

describe("daily goal copy", () => {
  it("names each goal with its exercises per day", () => {
    expect(goalChoiceLabel("light")).toBe("Suave · 10");
    expect(goalChoiceLabel("normal")).toBe("Normal · 20");
    expect(goalChoiceLabel("intense")).toBe("Intensa · 40");
    expect(goalChoiceLabel("off")).toBe("Sin meta");
  });

  it("shows today's count against the goal, and says it out loud in full", () => {
    const status = { kind: "on", done: 12, target: 20, met: false } as const;
    expect(goalProgressText(status)).toBe("12 / 20 hoy");
    expect(goalProgressLabel(status)).toBe("Meta diaria: 12 de 20 ejercicios hoy");
  });

  it("celebrates a met goal, keeping the count", () => {
    const status = { kind: "on", done: 14, target: 10, met: true } as const;
    expect(goalProgressText(status)).toBe("¡Meta cumplida!");
    expect(goalProgressLabel(status)).toBe("¡Meta cumplida! 14 de 10 ejercicios hoy");
  });

  it("gives the session summary a line, and nothing without a goal", () => {
    expect(goalSummaryLine(dailyGoalStatus("normal", 18))).toBe("Meta diaria: 18 / 20");
    expect(goalSummaryLine(dailyGoalStatus("normal", 20))).toBe("¡Cumpliste tu meta de hoy!");
    expect(goalSummaryLine(dailyGoalStatus("off", 20))).toBeNull();
  });
});
