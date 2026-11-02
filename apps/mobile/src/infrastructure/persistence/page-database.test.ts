import { createPageDatabase } from "./page-database";

describe("page database (one open per page)", () => {
  it("opens once however many times it is asked for (remounts, re-renders)", async () => {
    const open = jest.fn(async () => "db");
    const database = createPageDatabase<string>({ reopenable: false });

    const first = database.get(open);
    const second = database.get(open);
    const third = database.get(jest.fn(async () => "other"));

    expect(await first).toBe("db");
    expect(await second).toBe("db");
    expect(await third).toBe("db");
    expect(open).toHaveBeenCalledTimes(1);
    expect(database.opens()).toBe(1);
  });

  it("web: a failed open stays failed for the page (only a reload opens again)", async () => {
    const open = jest
      .fn<Promise<string>, []>()
      .mockRejectedValueOnce(new Error("The object is in an invalid state."))
      .mockResolvedValue("db");
    const database = createPageDatabase<string>({ reopenable: false });

    await expect(database.get(open)).rejects.toThrow("invalid state");
    database.reset();
    await expect(database.get(open)).rejects.toThrow("invalid state");

    expect(open).toHaveBeenCalledTimes(1);
  });

  it("native: a retry after a failed open opens again", async () => {
    const open = jest
      .fn<Promise<string>, []>()
      .mockRejectedValueOnce(new Error("disk I/O error"))
      .mockResolvedValue("db");
    const database = createPageDatabase<string>({ reopenable: true });

    await expect(database.get(open)).rejects.toThrow("disk I/O error");
    database.reset();

    expect(await database.get(open)).toBe("db");
    expect(database.opens()).toBe(2);
  });
});
