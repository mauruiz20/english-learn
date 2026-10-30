import { createSystemClock } from "./system-clock";

describe("createSystemClock", () => {
  it("uses the local calendar date late in the evening", () => {
    const clock = createSystemClock(() => new Date(2026, 0, 5, 23, 59, 30));

    expect(clock.today()).toBe("2026-01-05");
  });

  it("uses the local calendar date just after midnight", () => {
    const clock = createSystemClock(() => new Date(2026, 11, 31, 0, 0, 30));

    expect(clock.today()).toBe("2026-12-31");
  });

  it("reports the current time in milliseconds", () => {
    const at = new Date(2026, 9, 29, 12, 0, 0);
    const clock = createSystemClock(() => at);

    expect(clock.nowMs()).toBe(at.getTime());
  });
});
