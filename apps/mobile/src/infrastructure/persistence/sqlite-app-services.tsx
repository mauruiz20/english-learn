import { corpus } from "@english-learn/content/corpus";
import type { Clock, SettingsRepository } from "@english-learn/domain";
import {
  createSqliteProgressRepository,
  createSqliteSettingsRepository,
  type SqlDatabase,
} from "@english-learn/storage-sqlite";
import { openDatabaseAsync } from "expo-sqlite";
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
import type * as E2eDatabaseWorkers from "./e2e-database-workers";
import type * as E2eProgress from "./e2e-progress";
import type * as E2eSettingsWrites from "./e2e-settings-writes";
import { initProgressStore } from "./init-progress-store";
import { createOpenRetry, noOpenRetry, type OpenRetry } from "./open-retry";
import type { DatabaseOwnership, OwnershipState } from "./ownership/database-ownership";
import {
  DatabaseStuckScreen,
  OpenElsewhereScreen,
  ReleasedScreen,
} from "./ownership/ownership-screens";
import { createPlatformOwnership } from "./ownership/platform-ownership";
import { createPageDatabase, type PageDatabase } from "./page-database";
import { countWorkers } from "./worker-count";
import { notifyAppends } from "../sync/notify-appends";
import { createChangeSignal } from "../sync/sync-triggers";

export const DATABASE_NAME = "english-learn.db";

const isWeb = Platform.OS === "web" && typeof window !== "undefined";

/**
 * This page's database and how its open is retried. Web: ONE open per page lifetime (see
 * `createPageDatabase`), retried only by reloading the page, and the page's workers counted
 * (expo-sqlite's is the only one: a second would collide with it on the same OPFS files).
 */
export type DatabasePage = {
  readonly database: PageDatabase<SqlDatabase>;
  readonly openRetry: OpenRetry;
  readonly workersCreated: () => number;
};

function createDatabasePage(): DatabasePage {
  if (!isWeb) {
    return {
      database: createPageDatabase({ reopenable: true }),
      openRetry: noOpenRetry,
      workersCreated: () => 0,
    };
  }
  const workers = countWorkers();
  // `EXPO_PUBLIC_E2E` is inlined at build time: production builds drop this branch and its module.
  if (process.env.EXPO_PUBLIC_E2E === "1") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require("./e2e-database-workers") as typeof E2eDatabaseWorkers).exposeDatabaseWorkers(
      workers.created,
    );
  }
  let storage: Parameters<typeof createOpenRetry>[0]["storage"];
  try {
    // Throws when site data is blocked: then busy opens are not retried (see `decideOpenRetry`).
    storage = (globalThis as { sessionStorage?: typeof storage }).sessionStorage;
  } catch {
    storage = undefined;
  }
  return {
    database: createPageDatabase({ reopenable: false }),
    openRetry: createOpenRetry({
      storage,
      reload: () => window.location.reload(),
      workersCreated: workers.created,
    }),
    workersCreated: workers.created,
  };
}

/** Module level: the page keeps one database whatever React mounts, remounts or retries. */
const appDatabasePage = createDatabasePage();

/** Lines for "Detalles técnicos" when the open failed. No personal data. */
function openDetails(page: DatabasePage): string[] {
  return [
    `Workers de la base de datos: ${page.workersCreated()}`,
    "Sondeo de archivos: no",
    `Reintentos automáticos: ${page.openRetry.attempts()}`,
  ];
}

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

function SqliteServices({
  db,
  clock,
  onOpened,
  children,
}: {
  db: SqlDatabase;
  clock: Clock;
  onOpened: () => void;
  children: ReactNode;
}) {
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
  useEffect(() => {
    if (deviceId !== null) onOpened();
  }, [deviceId, onOpened]);
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

type OpenState =
  | { readonly kind: "opening" | "retrying" }
  | { readonly kind: "open"; readonly db: SqlDatabase }
  | { readonly kind: "failed"; readonly error: unknown };

/**
 * Opens (or joins) the page's database and runs migrations. A failure is thrown while rendering
 * so the error boundary shows a message instead of a blank screen, unless the retry policy
 * reloads the page (web, files briefly busy): then nothing shows until the reload.
 */
function PageDatabaseProvider({
  page,
  clock,
  children,
}: {
  page: DatabasePage;
  clock: Clock;
  children: ReactNode;
}) {
  const [state, setState] = useState<OpenState>({ kind: "opening" });
  useEffect(() => {
    let active = true;
    page.database
      .get(() => openAppDatabase(clock))
      .then(
        (db) => {
          if (active) setState({ kind: "open", db });
        },
        (error: unknown) => {
          if (!active) return;
          setState(
            page.openRetry.onFailure(error) ? { kind: "retrying" } : { kind: "failed", error },
          );
        },
      );
    return () => {
      active = false;
    };
  }, [page, clock]);
  const onOpened = useCallback(() => page.openRetry.onOpened(), [page]);

  if (state.kind === "failed") throw new DatabaseOpenError(state.error);
  if (state.kind !== "open") return null;
  return (
    <SqliteServices db={state.db} clock={clock} onOpened={onOpened}>
      {children}
    </SqliteServices>
  );
}

async function openAppDatabase(clock: Clock): Promise<SqlDatabase> {
  const db = await openDatabaseAsync(DATABASE_NAME);
  await initDatabase(db, clock);
  return db;
}

type GateState = { readonly kind: "checking" | "handing-over" } | OwnershipState;
const CHECKING: GateState = { kind: "checking" };

/**
 * Web: opens the database only once this page owns it (see `createDatabaseOwnership`). Shows
 * the loading state (nothing) while a reloaded page waits for the previous one to let go, the
 * "Usar aquí" screens when another tab answered that it has it or this tab just handed it over,
 * and the help screen when something holds it without answering ("Usar aquí" never loops).
 * When another tab asks for it, this tab finishes its writes and unmounts the app (stopping
 * sync and timers) before handing it over. Native: always owned.
 */
function DatabaseOwnershipGate({
  ownership,
  children,
}: {
  ownership: DatabaseOwnership;
  children: ReactNode;
}) {
  const [state, setState] = useState<GateState>(CHECKING);
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

  const owned = state.kind === "owned";
  useEffect(() => {
    if (!owned) return;
    return ownership.serve(async () => {
      await drainRef.current?.();
      setState({ kind: "handing-over" });
    });
  }, [ownership, owned]);

  const claimAgain = (claim: () => Promise<OwnershipState>) => {
    setState(CHECKING);
    void claim().then(setState);
  };

  switch (state.kind) {
    case "owned":
      return <DrainContext value={drainRef}>{children}</DrainContext>;
    case "open-elsewhere":
      return (
        <OpenElsewhereScreen
          onUseHere={() => claimAgain(() => ownership.takeOver())}
          diagnostics={state.diagnostics}
        />
      );
    case "stuck":
      return (
        <DatabaseStuckScreen
          onRetry={() => claimAgain(() => ownership.retry())}
          diagnostics={state.diagnostics}
        />
      );
    case "released":
      return <ReleasedScreen onUseHere={() => claimAgain(() => ownership.takeOver())} />;
    case "checking":
    case "handing-over":
      return null;
  }
}

/**
 * Opens the on-device database, runs migrations, and provides the app services. Any failure
 * (newer schema, corrupt file, storage unavailable, database still held elsewhere) or later
 * render error shows `AppErrorBoundary`'s message. Web: the page opens the database once (see
 * `DatabasePage`); a busy open retries by reloading a few times, and "Reintentar" reloads the
 * page (expo-sqlite's worker cannot reopen after a failed open). Native: "Reintentar" opens
 * again and remounts the app. On web the database opens only once this page owns it
 * (`ownership`).
 */
export function SqliteAppServicesProvider({
  children,
  ownership: givenOwnership,
  page = appDatabasePage,
}: {
  children: ReactNode;
  ownership?: DatabaseOwnership;
  page?: DatabasePage;
}) {
  const [attempt, setAttempt] = useState(0);
  const [ownership] = useState(() => givenOwnership ?? createPlatformOwnership());
  // Read once per page load (an e2e `?today=` override must survive in-app navigation).
  const [clock] = useState(createAppClock);
  const retry = () => {
    page.openRetry.clear();
    if (isWeb) {
      window.location.reload();
      return;
    }
    page.database.reset();
    setAttempt((n) => n + 1);
  };
  const details = useCallback(() => openDetails(page), [page]);
  return (
    <AppErrorBoundary key={attempt} onRetry={retry} details={details}>
      <DatabaseOwnershipGate ownership={ownership}>
        <PageDatabaseProvider page={page} clock={clock}>
          {children}
        </PageDatabaseProvider>
      </DatabaseOwnershipGate>
    </AppErrorBoundary>
  );
}
