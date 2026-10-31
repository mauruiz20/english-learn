import type { SyncStatus } from "@/infrastructure/sync/sync-coordinator";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function ago(ms: number): string {
  if (ms < MINUTE) return "hace un momento";
  if (ms < HOUR) return `hace ${Math.floor(ms / MINUTE)} min`;
  if (ms < DAY) return `hace ${Math.floor(ms / HOUR)} h`;
  const days = Math.floor(ms / DAY);
  return `hace ${days} ${days === 1 ? "día" : "días"}`;
}

/** The account screen's one-line sync status. */
export function syncStatusText(status: SyncStatus, now: number): string {
  switch (status.kind) {
    case "synced":
      return `Sincronizado ${ago(Math.max(0, now - status.at))}`;
    case "syncing":
      return "Sincronizando…";
    case "idle":
      return "Todavía no se sincronizó";
    case "offline":
      return "Sin conexión, se sincroniza al volver";
    case "error":
      // The technical message goes to the console, not to the learner.
      return "No pudimos sincronizar tu progreso.";
  }
}
