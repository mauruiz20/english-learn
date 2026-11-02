import { exposeDatabaseWorkers } from "./e2e-database-workers";

describe("exposeDatabaseWorkers", () => {
  afterEach(() => {
    delete (globalThis as { __e2e?: unknown }).__e2e;
  });

  it("exposes the live worker count as window.__e2e.dbWorkers", () => {
    let created = 1;
    exposeDatabaseWorkers(() => created);
    const host = globalThis as unknown as { __e2e: { dbWorkers: number } };

    expect(host.__e2e.dbWorkers).toBe(1);
    created = 2;
    expect(host.__e2e.dbWorkers).toBe(2);
  });
});
