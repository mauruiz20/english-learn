import { createFakeRepository } from "@/testing/fake-progress-repository";
import { notifyAppends } from "./notify-appends";

describe("notifyAppends", () => {
  it("signals after events were saved, not before and not on failure", async () => {
    const repository = createFakeRepository();
    const onAppended = jest.fn();
    const notifying = notifyAppends(repository, onAppended);

    await expect(notifying.appendEvents([{ bogus: true } as never])).rejects.toThrow();
    expect(onAppended).not.toHaveBeenCalled();

    await notifying.appendEvents([]);
    expect(onAppended).toHaveBeenCalledTimes(1);
    expect(await notifying.getXp()).toBe(0);
  });
});
