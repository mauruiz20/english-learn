import { corpus } from "@english-learn/content/corpus";
import type { Clock, SettingsRepository } from "@english-learn/domain";
import {
  createSqliteProgressRepository,
  createSqliteSettingsRepository,
  type SqlDatabase,
} from "@english-learn/storage-sqlite";
import { SQLiteProvider, useSQLiteContext } from "expo-sqlite";
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { Platform } from "react-native";
import { createAppClock } from "../clock/app-clock";
import { cryptoRandomBytes } from "../ids/crypto-random-bytes";
import { AppErrorBoundary } from "../errors/app-error-boundary";
import { AppServicesProvider, type AppServices } from "../services/app-services";
import { createExpoSoundPlayer } from "../sound/expo-sound-player";
import { awaitPendingWrites, createWriteTracker, trackWrites } from "./await-pending-writes";
import { DatabaseOpenError } from "./database-open-error";
import type * as E2eProgress from "./e2e-progress";
import type * as E2eSettingsWrites from "./e2e-settings-writes";
import { initProgressStore } from "./init-progress-store";
import type { ClaimResult, DatabaseOwnership } from "./ownership/database-ownership";
import { OpenElsewhereScreen, ReleasedScreen } from "./ownership/ownership-screens";
import { createPlatformOwnership } from "./ownership/platform-ownership";
import { notifyAppends } from "../sync/notify-appends";
import { createChangeSignal } from "../sync/sync-triggers";

export const DATABASE_NAME = "english-learn.db";

const SYNC_WRITES = [
  "markSynced",
  "setSyncCursor",
  "insertRemoteEvents",
  "replaceDeviceId",
  "resetSyncState",
  "clearProgress",
] as const;

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

/** Where the open database registers how to finish its writes before another tab takes it. */
const DrainContext = createContext<RefObject<(() => Promise<void>) | null> | null>(null);

function SqliteServices({ clock, children }: { clock: Clock; children: ReactNode }) {
  const db = useSQLiteContext();
  const drainRef = use(DrainContext);
  // Every write (saves and the sync's), so handing the database over never cuts one halfway.
  const [writes] = useState(createWriteTracker);
  useEffect(() => {
    if (drainRef === null) return;
    drainRef.current = writes.drain;
    return () => {
      drainRef.current = null;
    };
  }, [drainRef, writes]);
  // Sounds are loaded once and kept for the app's lifetime.
  const [sounds] = useState(createExpoSoundPlayer);
  const [progressRepository] = useState(() => createSqliteProgressRepository(db));
  const [settingsRepository] = useState(() => createSettingsRepository(db));
  // "Progress was saved here": the account's sync uploads it (see AccountProvider).
  const [localChanges] = useState(createChangeSignal);
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
            progressRepository: notifyAppends(
              awaitPendingWrites(progressRepository, writes),
              localChanges.emit,
            ),
            clock,
            random: Math.random,
            randomBytes: cryptoRandomBytes,
            deviceId,
            settingsRepository,
            sounds,
            account: {
              syncStore: trackWrites(progressRepository, writes, SYNC_WRITES),
              localChanges,
            },
            transfer: trackWrites(progressRepository, writes, ["importEvents"]),
          },
    [progressRepository, settingsRepository, clock, deviceId, sounds, localChanges, writes],
  );
  if (services === null) return null;
  return <AppServicesProvider services={services}>{children}</AppServicesProvider>;
}

// SQLiteProvider calls this while rendering when opening or migrating fails; throwing hands the
// failure to the error boundary, which shows a message instead of a blank screen.
function throwDatabaseOpenError(error: Error): never {
  throw new DatabaseOpenError(error);
}

type GateState = "checking" | ClaimResult | "released" | "handing-over";

/**
 * Web: opens the database only once this page owns it (see `createDatabaseOwnership`). Shows
 * the loading state (nothing) while a reloaded page waits for the previous one to let go, and
 * "Usar aquí" screens when another tab has it or this tab just handed it over. When another tab
 * asks for it, this tab finishes its writes and unmounts the app (stopping sync and timers)
 * before handing it over. Native: always owned.
 */
function DatabaseOwnershipGate({
  ownership,
  children,
}: {
  ownership: DatabaseOwnership;
  children: ReactNode;
}) {
  const [state, setState] = useState<GateState>("checking");
  const drainRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    let active = true;
    void ownership.start().then((result) => {
      if (active) setState(result);
    });
    return () => {
      active = false;
    };
  }, [ownership]);

  useEffect(() => {
    if (state !== "owned") return;
    return ownership.serve(async () => {
      await drainRef.current?.();
      setState("handing-over");
    });
  }, [ownership, state]);

  const useHere = () => {
    setState("checking");
    void ownership.takeOver().then(setState);
  };

  switch (state) {
    case "owned":
      return <DrainContext value={drainRef}>{children}</DrainContext>;
    case "open-elsewhere":
      return <OpenElsewhereScreen onUseHere={useHere} />;
    case "released":
      return <ReleasedScreen onUseHere={useHere} />;
    case "checking":
    case "handing-over":
      return null;
  }
}

/**
 * Opens the on-device database, runs migrations, and provides the app services. Any failure
 * (newer schema, corrupt file, storage unavailable, database still held elsewhere) or later
 * render error shows `AppErrorBoundary`'s message. "Reintentar" reloads the page on web
 * (expo-sqlite's worker cannot reopen after a failed open) and remounts the app with a fresh
 * open elsewhere. On web the database opens only once this page owns it (`ownership`).
 */
export function SqliteAppServicesProvider({
  children,
  ownership: givenOwnership,
}: {
  children: ReactNode;
  ownership?: DatabaseOwnership;
}) {
  const [attempt, setAttempt] = useState(0);
  const [ownership] = useState(() => givenOwnership ?? createPlatformOwnership());
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
      <DatabaseOwnershipGate ownership={ownership}>
        <SQLiteProvider
          databaseName={DATABASE_NAME}
          onInit={onInit}
          onError={throwDatabaseOpenError}
        >
          <SqliteServices clock={clock}>{children}</SqliteServices>
        </SQLiteProvider>
      </DatabaseOwnershipGate>
    </AppErrorBoundary>
  );
}
