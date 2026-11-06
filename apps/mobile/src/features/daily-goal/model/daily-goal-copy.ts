import type { DailyGoal, DailyGoalStatus } from "@english-learn/domain";

type OnStatus = Extract<DailyGoalStatus, { kind: "on" }>;

const CHOICE_LABELS: Readonly<Record<DailyGoal, string>> = {
  light: "Suave · 10",
  normal: "Normal · 20",
  intense: "Intensa · 40",
  off: "Sin meta",
};

/** The goal as the picker offers it ("Normal · 20"). */
export function goalChoiceLabel(goal: DailyGoal): string {
  return CHOICE_LABELS[goal];
}

/** Home's short line beside the ring: "12 / 20 hoy", or "¡Meta cumplida!". */
export function goalProgressText(status: OnStatus): string {
  return status.met ? "¡Meta cumplida!" : `${status.done} / ${status.target} hoy`;
}

/** What a screen reader hears for the ring: the count in words. */
export function goalProgressLabel(status: OnStatus): string {
  const count = `${status.done} de ${status.target} ejercicios hoy`;
  return status.met ? `¡Meta cumplida! ${count}` : `Meta diaria: ${count}`;
}

/** The session summary's line ("Meta diaria: 18 / 20"); null without a goal. */
export function goalSummaryLine(status: DailyGoalStatus): string | null {
  if (status.kind === "off") return null;
  return status.met
    ? "¡Cumpliste tu meta de hoy!"
    : `Meta diaria: ${status.done} / ${status.target}`;
}
