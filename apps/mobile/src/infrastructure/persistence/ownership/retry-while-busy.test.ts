import { RETRY_DELAYS_MS, retryWhileBusy, type ProbeResult } from "./retry-while-busy";

function scripted(results: ProbeResult[]) {
  const calls: number[] = [];
  let elapsed = 0;
  const sleep = async (ms: number) => {
    elapsed += ms;
  };
  const probe = async () => {
    calls.push(elapsed);
    return results.shift() ?? "busy";
  };
  return { probe, sleep, calls };
}

describe("retryWhileBusy", () => {
  it("backs off for about six seconds in total", () => {
    expect(RETRY_DELAYS_MS).toEqual([100, 200, 400, 800, 1600, 2400]);
    expect(RETRY_DELAYS_MS.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(6000);
  });

  it("returns at once when the database is free", async () => {
    const { probe, sleep, calls } = scripted(["free"]);
    await expect(retryWhileBusy(probe, sleep)).resolves.toBe("free");
    expect(calls).toEqual([0]);
  });

  it("retries while the previous page still holds the database, with growing delays", async () => {
    const { probe, sleep, calls } = scripted(["busy", "busy", "busy", "free"]);
    await expect(retryWhileBusy(probe, sleep)).resolves.toBe("free");
    expect(calls).toEqual([0, 100, 300, 700]);
  });

  it("gives up as busy once every delay was spent", async () => {
    const { probe, sleep, calls } = scripted([]);
    await expect(retryWhileBusy(probe, sleep)).resolves.toBe("busy");
    expect(calls).toEqual([0, 100, 300, 700, 1500, 3100, 5500]);
  });

  it("does not retry genuine failures (they surface through the normal open)", async () => {
    const { probe, sleep, calls } = scripted(["busy", "error"]);
    await expect(retryWhileBusy(probe, sleep)).resolves.toBe("error");
    expect(calls).toHaveLength(2);
  });
});
