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

  describe("in a timezone west of UTC", () => {
    // `new Date(y, m, d, ...)` above is local time too, so on its own it cannot tell local from
    // UTC dates. Here the instant is fixed in UTC; Jest runs in America/Mexico_City (UTC-6, see
    // jest.global-setup.js).
    it("returns the local date late at night, when UTC is already tomorrow", () => {
      // 23:30 on Jan 4 in Mexico City is 05:30 on Jan 5 in UTC.
      const clock = createSystemClock(() => new Date(Date.UTC(2026, 0, 5, 5, 30)));

      expect(new Date(Date.UTC(2026, 0, 5, 5, 30)).getTimezoneOffset()).toBe(360);
      expect(clock.today()).toBe("2026-01-04");
    });
  });

  it("reports the current time in milliseconds", () => {
    const at = new Date(2026, 9, 29, 12, 0, 0);
    const clock = createSystemClock(() => at);

    expect(clock.nowMs()).toBe(at.getTime());
  });
});
