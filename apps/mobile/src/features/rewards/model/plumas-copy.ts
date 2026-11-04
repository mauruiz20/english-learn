import {
  DAILY_PLUMAS_CAP,
  type PlumasEarned,
  type PlumasSource,
  type PlumasWelcome,
} from "@english-learn/domain";

/** What kind of session earned the plumas (a card practice is saved as a lesson). */
export type PlumasSessionKind = "lesson" | "card" | "review";

/** "1 pluma", "135 plumas". */
export function formatPlumas(plumas: number): string {
  return `${plumas} ${plumas === 1 ? "pluma" : "plumas"}`;
}

/** The balance as a screen reader says it: "Tienes 135 plumas", or "Debes 30 plumas". */
export function balanceLabel(balance: number): string {
  return balance < 0 ? `Debes ${formatPlumas(-balance)}` : `Tienes ${formatPlumas(balance)}`;
}

function sourceName(source: PlumasSource, plumas: number, kind: PlumasSessionKind): string {
  switch (source) {
    case "study_day":
      return "Día de estudio";
    case "new_lesson":
      return kind === "card" ? "Ficha nueva" : "Lección nueva";
    case "perfect_page":
      return "Página perfecta";
    case "on_time_review":
      return plumas === 1 ? "Repaso a tiempo" : "Repasos a tiempo";
    case "daily_review":
      return "Repaso del día";
    case "study_week":
      return "Semana de estudio";
    case "welcome":
      return "Bienvenida";
  }
}

const CAP_REACHED = `Ya ganaste las ${DAILY_PLUMAS_CAP} plumas de hoy. Tu práctica sigue contando para tu repaso.`;

/** The summary's plumas row: the total, and why ("Día de estudio +5 · Lección nueva +5"). */
export type SessionPlumas = { readonly total: number; readonly detail: string };

/**
 * The total is never negative, and the reasons always add up to it: without a breakdown
 * (`plumasEarned` drops it when a refold moved plumas between sources) `detail` is empty, or only
 * the cap note.
 */
export function sessionPlumas(earned: PlumasEarned, kind: PlumasSessionKind): SessionPlumas {
  const total = Math.max(0, earned.total);
  const reasons = earned.bySource.map(
    ({ source, plumas }) => `${sourceName(source, plumas, kind)} +${plumas}`,
  );
  if (earned.capped) reasons.push(CAP_REACHED);
  if (reasons.length === 0 && total === 0) {
    reasons.push(
      kind === "review"
        ? "Este repaso no sumó plumas, pero te ayuda a recordar."
        : "Repetir no da plumas, pero te ayuda a recordar.",
    );
  }
  return { total, detail: reasons.join(" · ") };
}

/**
 * The one-time note for the plumas a baseline granted ("Bienvenida": lessons done before the
 * event log). The first home visit with progress decides: with a grant, the note shows that
 * amount until it is dismissed; without one (a learner who started with the event log, even
 * after a first lesson), it never shows. `store` is what to remember, when it changes.
 */
export function plumasWelcome(
  stored: PlumasWelcome | null,
  welcome: number,
): { readonly show: number | null; readonly store: PlumasWelcome | null } {
  if (stored === null) {
    return welcome > 0
      ? { show: welcome, store: { plumas: welcome, dismissed: false } }
      : { show: null, store: { plumas: 0, dismissed: true } };
  }
  return { show: stored.dismissed ? null : stored.plumas, store: null };
}

export function welcomeText(plumas: number): string {
  return `Avi te guardó ${formatPlumas(plumas)} por lo que ya estudiaste.`;
}
