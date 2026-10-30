import { corpus } from "@english-learn/content/corpus";
import type { Clock, SettingsRepository } from "@english-learn/domain";
import {
  createSqliteProgressRepository,
  createSqliteSettingsRepository,
  type SqlDatabase,
} from "@english-learn/storage-sqlite";
import { SQLiteProvider, useSQLiteContext } from "expo-sqlite";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Platform } from "react-native";
import { createAppClock } from "../clock/app-clock";
import { cryptoRandomBytes } from "../ids/crypto-random-bytes";
import { AppErrorBoundary } from "../errors/app-error-boundary";
import { AppServicesProvider, type AppServices } from "../services/app-services";
import { createExpoSoundPlayer } from "../sound/expo-sound-player";
import { awaitPendingWrites } from "./await-pending-writes";
import { DatabaseOpenError } from "./database-open-error";
import type * as E2eProgress from "./e2e-progress";
import type * as E2eSettingsWrites from "./e2e-settings-writes";
import { initProgressStore } from "./init-progress-store";

export const DATABASE_NAME = "english-learn.db";

/**
 * Runs on every open: migrations, the device id and, for progress from before the event log, its
 * baseline event (see `initProgressStore`).
 */
async function initDatabase(db: SqlDatabase, clock: Clock): Promise<void> {
  const repository = await initProgressStore(db, {
    clock,
    randomBytes: cryptoRandomBytes,
    content: corpus,
  });
  // `EXPO_PUBLIC_E2E` is inlined at build time: production builds drop this branch.
  if (process.env.EXPO_PUBLIC_E2E === "1" && typeof window !== "undefined") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { rebuildRequested } = require("./e2e-progress") as typeof E2eProgress;
    if (rebuildRequested(window.location.search)) await repository.rebuildFromEvents();
  }
}

function createSettingsRepository(db: SqlDatabase): SettingsRepository {
  const repository = createSqliteSettingsRepository(db);
  // `EXPO_PUBLIC_E2E` is inlined at build time: production builds drop this branch and its module.
  if (process.env.EXPO_PUBLIC_E2E === "1") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { exposeSettingsWrites } = require("./e2e-settings-writes") as typeof E2eSettingsWrites;
    return exposeSettingsWrites(repository);
  }
  return repository;
}

function SqliteServices({ clock, children }: { clock: Clock; children: ReactNode }) {
  const db = useSQLiteContext();
  // Sounds are loaded once and kept for the app's lifetime.
  const [sounds] = useState(createExpoSoundPlayer);
  const [progressRepository] = useState(() => createSqliteProgressRepository(db));
  const [settingsRepository] = useState(() => createSettingsRepository(db));
  // Stored by `initDatabase`; read once so every save stamps it without an extra async step.
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [failure, setFailure] = useState<Error | null>(null);
  useEffect(() => {
    progressRepository.getDeviceId().then(setDeviceId, (error: Error) => setFailure(error));
  }, [progressRepository]);
  if (failure !== null) throw new DatabaseOpenError(failure);

  const services = useMemo<AppServices | null>(
    () =>
      deviceId === null
        ? null
        : {
            // Reads wait for in-flight saves: leaving mid-save must not show stale progress.
            progressRepository: awaitPendingWrites(progressRepository),
            clock,
            random: Math.random,
            randomBytes: cryptoRandomBytes,
            deviceId,
            settingsRepository,
            sounds,
          },
    [progressRepository, settingsRepository, clock, deviceId, sounds],
  );
  if (services === null) return null;
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
  // Read once per page load (an e2e `?today=` override must survive in-app navigation).
  const [clock] = useState(createAppClock);
  // Stable: SQLiteProvider reopens the database whenever `onInit` changes.
  const onInit = useCallback((db: SqlDatabase) => initDatabase(db, clock), [clock]);
  const retry = () => {
    if (Platform.OS === "web" && typeof window !== "undefined") window.location.reload();
    else setAttempt((n) => n + 1);
  };
  return (
    <AppErrorBoundary key={attempt} onRetry={retry}>
      <SQLiteProvider databaseName={DATABASE_NAME} onInit={onInit} onError={throwDatabaseOpenError}>
        <SqliteServices clock={clock}>{children}</SqliteServices>
      </SQLiteProvider>
    </AppErrorBoundary>
  );
}
