import {
  createSqliteProgressRepository,
  createSqliteSettingsRepository,
  migrate,
} from "@english-learn/storage-sqlite";
import { SQLiteProvider, useSQLiteContext } from "expo-sqlite";
import { useMemo, useState, type ReactNode } from "react";
import { Platform } from "react-native";
import { createAppClock } from "../clock/app-clock";
import { AppErrorBoundary } from "../errors/app-error-boundary";
import { AppServicesProvider, type AppServices } from "../services/app-services";
import { createExpoSoundPlayer } from "../sound/expo-sound-player";
import { awaitPendingWrites } from "./await-pending-writes";
import { DatabaseOpenError } from "./database-open-error";

export const DATABASE_NAME = "english-learn.db";

function SqliteServices({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  // Read once per page load (an e2e `?today=` override must survive in-app navigation).
  const [clock] = useState(createAppClock);
  // Sounds are loaded once and kept for the app's lifetime.
  const [sounds] = useState(createExpoSoundPlayer);
  const services = useMemo<AppServices>(
    () => ({
      // Reads wait for in-flight saves: leaving mid-save must not show stale progress.
      progressRepository: awaitPendingWrites(createSqliteProgressRepository(db)),
      clock,
      random: Math.random,
      settingsRepository: createSqliteSettingsRepository(db),
      sounds,
    }),
    [db, clock, sounds],
  );
  return <AppServicesProvider services={services}>{children}</AppServicesProvider>;
}

// SQLiteProvider calls this while rendering when opening or migrating fails; throwing hands the
// failure to the error boundary, which shows a message instead of a blank screen.
function throwDatabaseOpenError(error: Error): never {
  throw new DatabaseOpenError(error);
}

/**
 * Opens the on-device database, runs migrations, and provides the app services. Any failure
 * (database open in another tab, newer schema, corrupt file) or later render error shows
 * `AppErrorBoundary`'s message. "Reintentar" reloads the page on web (expo-sqlite's worker
 * cannot reopen after a failed open) and remounts the app with a fresh open elsewhere.
 */
export function SqliteAppServicesProvider({ children }: { children: ReactNode }) {
  const [attempt, setAttempt] = useState(0);
  const retry = () => {
    if (Platform.OS === "web" && typeof window !== "undefined") window.location.reload();
    else setAttempt((n) => n + 1);
  };
  return (
    <AppErrorBoundary key={attempt} onRetry={retry}>
      <SQLiteProvider
        databaseName={DATABASE_NAME}
        onInit={migrate}
        onError={throwDatabaseOpenError}
      >
        <SqliteServices>{children}</SqliteServices>
      </SQLiteProvider>
    </AppErrorBoundary>
  );
}
