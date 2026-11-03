import type { PlumasEarned } from "@english-learn/domain";
import {
  balanceLabel,
  formatPlumas,
  plumasWelcome,
  sessionPlumas,
  welcomeText,
} from "./plumas-copy";

const earned = (bySource: PlumasEarned["bySource"], capped = false): PlumasEarned => ({
  total: bySource.reduce((sum, s) => sum + s.plumas, 0),
  bySource,
  capped,
});

describe("formatPlumas", () => {
  it("says pluma or plumas", () => {
    expect(formatPlumas(1)).toBe("1 pluma");
    expect(formatPlumas(0)).toBe("0 plumas");
    expect(formatPlumas(135)).toBe("135 plumas");
  });
});

describe("balanceLabel", () => {
  it("reads a balance, or a debt after offline purchases", () => {
    expect(balanceLabel(135)).toBe("Tienes 135 plumas");
    expect(balanceLabel(1)).toBe("Tienes 1 pluma");
    expect(balanceLabel(0)).toBe("Tienes 0 plumas");
    expect(balanceLabel(-30)).toBe("Debes 30 plumas");
  });
});

describe("sessionPlumas", () => {
  it("lists what the session earned, source by source", () => {
    expect(
      sessionPlumas(
        earned([
          { source: "study_day", plumas: 5 },
          { source: "new_lesson", plumas: 5 },
          { source: "perfect_page", plumas: 10 },
          { source: "on_time_review", plumas: 7 },
        ]),
        "lesson",
      ),
    ).toEqual({
      total: 27,
      detail: "Día de estudio +5 · Lección nueva +5 · Página perfecta +10 · Repasos a tiempo +7",
    });
  });

  it("names a card practice and a single on-time review", () => {
    expect(
      sessionPlumas(
        earned([
          { source: "new_lesson", plumas: 5 },
          { source: "on_time_review", plumas: 1 },
        ]),
        "card",
      ).detail,
    ).toBe("Ficha nueva +5 · Repaso a tiempo +1");
    expect(
      sessionPlumas(
        earned([
          { source: "daily_review", plumas: 5 },
          { source: "study_week", plumas: 15 },
        ]),
        "review",
      ).detail,
    ).toBe("Repaso del día +5 · Semana de estudio +15");
  });

  it("explains a session that earned nothing", () => {
    expect(sessionPlumas(earned([]), "lesson")).toEqual({
      total: 0,
      detail: "Repetir no da plumas, pero te ayuda a recordar.",
    });
    expect(sessionPlumas(earned([]), "review").detail).toBe(
      "Este repaso no sumó plumas, pero te ayuda a recordar.",
    );
  });

  it("says when the daily cap was reached", () => {
    expect(sessionPlumas(earned([], true), "lesson").detail).toBe(
      "Ya ganaste las 40 plumas de hoy. Tu práctica sigue contando para tu repaso.",
    );
    expect(sessionPlumas(earned([{ source: "new_lesson", plumas: 5 }], true), "lesson")).toEqual({
      total: 5,
      detail:
        "Lección nueva +5 · Ya ganaste las 40 plumas de hoy. Tu práctica sigue contando para tu repaso.",
    });
  });
});

describe("plumasWelcome (the one-time note for study done before plumas existed)", () => {
  it("decides on the first visit: a learner with plumas gets the note, a new one never", () => {
    expect(plumasWelcome(null, 135)).toEqual({
      show: 135,
      store: { plumas: 135, dismissed: false },
    });
    expect(plumasWelcome(null, 0)).toEqual({
      show: null,
      store: { plumas: 0, dismissed: true },
    });
  });

  it("keeps showing the amount first decided until it is dismissed", () => {
    expect(plumasWelcome({ plumas: 135, dismissed: false }, 160)).toEqual({
      show: 135,
      store: null,
    });
    expect(plumasWelcome({ plumas: 135, dismissed: true }, 160)).toEqual({
      show: null,
      store: null,
    });
  });

  it("reads as Avi saving them", () => {
    expect(welcomeText(135)).toBe("Avi te guardó 135 plumas por lo que ya estudiaste.");
    expect(welcomeText(5)).toBe("Avi te guardó 5 plumas por lo que ya estudiaste.");
  });
});
