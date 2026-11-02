import { countWorkers } from "./worker-count";

class FakeWorker {
  constructor(readonly url: string) {}
}

describe("countWorkers", () => {
  it("counts every worker the page creates, and the workers still work", () => {
    const globals: { Worker?: unknown } = { Worker: FakeWorker };
    const count = countWorkers(globals);
    const Worker = globals.Worker as typeof FakeWorker;

    expect(count.created()).toBe(0);
    const worker = new Worker("blob:sqlite");
    new Worker("blob:other");

    expect(count.created()).toBe(2);
    expect(worker).toBeInstanceOf(FakeWorker);
    expect(worker.url).toBe("blob:sqlite");
  });

  it("installs once: a second call shares the same count", () => {
    const globals: { Worker?: unknown } = { Worker: FakeWorker };
    const first = countWorkers(globals);
    const second = countWorkers(globals);
    new (globals.Worker as typeof FakeWorker)("blob:sqlite");

    expect(first.created()).toBe(1);
    expect(second.created()).toBe(1);
  });

  it("without Worker (native, tests) counts nothing", () => {
    expect(countWorkers({}).created()).toBe(0);
  });
});
