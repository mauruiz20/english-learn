import { localDate, type Streak } from "@english-learn/domain";
import { NO_NEWS, createHomeAviMemory, homeAviState, type HomeAviInput } from "./home-avi";

const TODAY = localDate("2026-11-05");
const YESTERDAY = localDate("2026-11-04");
const LAST_WEEK = localDate("2026-10-29");

const streak = (lastActiveDate: string | null, current = 3, longest = 5): Streak => ({
  current,
  longest,
  lastActiveDate: lastActiveDate === null ? null : localDate(lastActiveDate),
});

/** A learner who studied yesterday, opened home yesterday, has nothing due, at noon. */
const base: HomeAviInput = {
  today: TODAY,
  hour: 12,
  streak: streak(YESTERDAY),
  lastHomeVisit: TODAY,
  pendingReviews: 0,
  hasProgress: true,
  news: NO_NEWS,
};

describe("homeAviState", () => {
  it("greets a fresh learner, happy, inviting them to start", () => {
    const state = homeAviState({
      ...base,
      streak: streak(null, 0, 0),
      lastHomeVisit: null,
      hasProgress: false,
    });

    expect(state).toEqual({
      kind: "idle",
      mood: "happy",
      bubble: "¡Hola! Soy Avi. ¿Empezamos?",
      moment: null,
    });
  });

  it("celebrates a lesson just done with a hop", () => {
    const state = homeAviState({
      ...base,
      streak: streak(TODAY),
      news: { ...NO_NEWS, lessonDone: true },
    });

    expect(state).toEqual({
      kind: "celebrate",
      mood: "cheer",
      bubble: "¡Lo lograste!",
      moment: "hop",
    });
  });

  it("celebrates a new album badge with a loop", () => {
    const state = homeAviState({ ...base, news: { ...NO_NEWS, lessonDone: true, badge: true } });

    expect(state).toMatchObject({ kind: "celebrate", moment: "loop" });
  });

  it("cheers once the daily goal is met, with a hop", () => {
    const state = homeAviState({
      ...base,
      streak: streak(TODAY),
      news: { ...NO_NEWS, goalMet: true },
    });

    expect(state).toEqual({
      kind: "celebrate",
      mood: "cheer",
      bubble: "¡Meta cumplida!",
      moment: "hop",
    });
  });

  it("keeps the lesson's cheer when the goal is met by that lesson", () => {
    const state = homeAviState({
      ...base,
      news: { ...NO_NEWS, lessonDone: true, goalMet: true },
    });

    expect(state).toMatchObject({ kind: "celebrate", bubble: "¡Lo lograste!", moment: "hop" });
  });

  it("misses a learner whose streak broke, without guilt or numbers", () => {
    const state = homeAviState({
      ...base,
      streak: streak(LAST_WEEK, 4, 9),
      lastHomeVisit: LAST_WEEK,
    });

    expect(state).toEqual({
      kind: "missed-you",
      mood: "sad",
      bubble: "Te extrañé. Hoy empezamos una racha nueva.",
      moment: "droop",
    });
    expect(state.bubble).not.toMatch(/\d|perd/);
  });

  it("perks up once a session is saved today", () => {
    const state = homeAviState({ ...base, streak: streak(TODAY, 1, 9), lastHomeVisit: LAST_WEEK });

    expect(state.kind).not.toBe("missed-you");
  });

  it("does not miss a learner who never had a streak", () => {
    const state = homeAviState({
      ...base,
      streak: streak(null, 0, 0),
      lastHomeVisit: LAST_WEEK,
      hasProgress: true,
    });

    expect(state.kind).toBe("welcome-back");
  });

  it("welcomes the learner back on the first visit of a new day, with a wave", () => {
    const state = homeAviState({ ...base, lastHomeVisit: YESTERDAY });

    expect(state).toEqual({
      kind: "welcome-back",
      mood: "happy",
      bubble: "¡Qué bueno verte!",
      moment: "wave",
    });
  });

  it("does not welcome back on a later visit the same day", () => {
    expect(homeAviState(base).kind).toBe("idle");
  });

  it("rests, sleepy, when today's study is done and nothing is due", () => {
    const state = homeAviState({ ...base, streak: streak(TODAY) });

    expect(state).toEqual({
      kind: "resting",
      mood: "sleepy",
      bubble: "Todo listo por hoy.",
      moment: null,
    });
  });

  it("invites a review when something is due, even after studying today", () => {
    const state = homeAviState({ ...base, streak: streak(TODAY), pendingReviews: 3 });

    expect(state).toEqual({
      kind: "idle",
      mood: "happy",
      bubble: "¿Repasamos un poco?",
      moment: null,
    });
  });

  it.each([22, 23, 0, 5])("is sleepy at night (%i h)", (hour) => {
    const state = homeAviState({ ...base, hour, pendingReviews: 2 });

    expect(state).toEqual({
      kind: "resting",
      mood: "sleepy",
      bubble: "Ya es tarde. ¡Que descanses!",
      moment: null,
    });
  });

  it.each([6, 12, 21])("is awake at %i h", (hour) => {
    expect(homeAviState({ ...base, hour }).kind).toBe("idle");
  });

  it("welcomes back before going to sleep", () => {
    expect(homeAviState({ ...base, hour: 23, lastHomeVisit: YESTERDAY }).kind).toBe("welcome-back");
  });

  it("idles with nothing to say otherwise", () => {
    expect(homeAviState(base)).toEqual({ kind: "idle", mood: "happy", bubble: null, moment: null });
  });
});

describe("createHomeAviMemory", () => {
  const seen = { badges: ["first-lesson"], goalMet: false };

  it("finds nothing new on the first look of the session", () => {
    expect(createHomeAviMemory().take(seen)).toEqual(NO_NEWS);
  });

  it("reports a new badge once", () => {
    const memory = createHomeAviMemory();
    memory.take(seen);

    const next = { badges: ["first-lesson", "streak-3"], goalMet: false };
    expect(memory.take(next)).toEqual({ ...NO_NEWS, badge: true });
    expect(memory.take(next)).toEqual(NO_NEWS);
  });

  it("reports the daily goal met once, never on the first look (a reload cheers nothing)", () => {
    const met = { badges: ["first-lesson"], goalMet: true };
    const reloaded = createHomeAviMemory();
    expect(reloaded.take(met)).toEqual(NO_NEWS);

    const memory = createHomeAviMemory();
    memory.take(seen);
    expect(memory.take(met)).toEqual({ ...NO_NEWS, goalMet: true });
    expect(memory.take(met)).toEqual(NO_NEWS);
    // A new day starts unmet; meeting it again cheers again.
    memory.take(seen);
    expect(memory.take(met)).toEqual({ ...NO_NEWS, goalMet: true });
  });
});
