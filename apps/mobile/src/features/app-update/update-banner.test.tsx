import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type {
  ServiceWorkerUpdates,
  UpdateStatus,
} from "@/infrastructure/pwa/service-worker-updates";
import { UpdateBanner } from "./update-banner";
import { UpdateBannerView } from "./update-banner-view";

function createFakeUpdates(initial: UpdateStatus = "idle") {
  let status = initial;
  const listeners = new Set<() => void>();
  const updates: ServiceWorkerUpdates & { set(next: UpdateStatus): void } = {
    start: jest.fn(async () => {}),
    checkForUpdates: jest.fn(async () => {}),
    apply: jest.fn(() => updates.set("applying")),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => status,
    set(next) {
      status = next;
      for (const listener of listeners) listener();
    },
  };
  return updates;
}

describe("UpdateBannerView", () => {
  it("announces the new version and offers to update", async () => {
    const onUpdate = jest.fn();
    await render(<UpdateBannerView applying={false} onUpdate={onUpdate} />);

    expect(screen.getByText("Hay una versión nueva")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Actualizar" }));
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("is a polite status message, not an interruption", async () => {
    await render(<UpdateBannerView applying={false} onUpdate={() => {}} />);
    expect(screen.getByLabelText("Hay una versión nueva")).toHaveProp(
      "accessibilityLiveRegion",
      "polite",
    );
  });

  it("disables the button while the update is applied", async () => {
    await render(<UpdateBannerView applying onUpdate={() => {}} />);
    expect(screen.getByRole("button", { name: "Actualizando…" })).toBeDisabled();
  });
});

describe("UpdateBanner", () => {
  it("shows nothing while there is no update", async () => {
    await render(<UpdateBanner updates={createFakeUpdates()} />);
    expect(screen.queryByText("Hay una versión nueva")).not.toBeOnTheScreen();
  });

  it("appears when a new version is waiting and applies it only on press", async () => {
    const updates = createFakeUpdates();
    await render(<UpdateBanner updates={updates} />);

    await act(async () => updates.set("available"));
    expect(screen.getByText("Hay una versión nueva")).toBeOnTheScreen();
    expect(updates.apply).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole("button", { name: "Actualizar" }));
    expect(updates.apply).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Actualizando…" })).toBeDisabled();
  });
});
