import { localDate } from "@english-learn/domain";
import { e2eClock, todayFromSearch } from "./e2e-clock";
import { createSystemClock } from "./system-clock";

describe("todayFromSearch", () => {
  it("reads a valid ?today=YYYY-MM-DD", () => {
    expect(todayFromSearch("?today=2030-01-03")).toBe("2030-01-03");
    expect(todayFromSearch("?x=1&today=2030-01-03")).toBe("2030-01-03");
  });

  it.each(["", "?today=", "?today=tomorrow", "?today=2030-02-30", "?other=2030-01-03"])(
    "ignores %j",
    (search) => {
      expect(todayFromSearch(search)).toBeNull();
    },
  );
});

describe("e2eClock", () => {
  const at = new Date(2026, 9, 29, 12, 0, 0);
  const base = createSystemClock(() => at);

  it("overrides today() and keeps the real time for response timing", () => {
    const clock = e2eClock(base, "?today=2030-01-03");

    expect(clock.today()).toBe(localDate("2030-01-03"));
    expect(clock.nowMs()).toBe(at.getTime());
  });

  it("returns the base clock without a valid override", () => {
    expect(e2eClock(base, "")).toBe(base);
  });
});
