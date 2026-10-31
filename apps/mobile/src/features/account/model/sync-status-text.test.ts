import { syncStatusText } from "./sync-status-text";

const NOW = 10_000_000;

describe("syncStatusText", () => {
  it.each([
    [{ kind: "synced", at: NOW - 20_000 }, "Sincronizado hace un momento"],
    [{ kind: "synced", at: NOW - 2 * 60_000 }, "Sincronizado hace 2 min"],
    [{ kind: "synced", at: NOW - 3 * 3_600_000 }, "Sincronizado hace 3 h"],
    [{ kind: "synced", at: NOW - 49 * 3_600_000 }, "Sincronizado hace 2 días"],
    [{ kind: "syncing" }, "Sincronizando…"],
    [{ kind: "idle" }, "Todavía no se sincronizó"],
    [{ kind: "offline" }, "Sin conexión, se sincroniza al volver"],
    [{ kind: "error", message: "http_500: boom" }, "No pudimos sincronizar tu progreso."],
  ] as const)("%j → %s", (status, text) => {
    expect(syncStatusText(status, NOW)).toBe(text);
  });
});
