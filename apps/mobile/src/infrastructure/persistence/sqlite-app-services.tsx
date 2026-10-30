import { createSqliteProgressRepository, migrate } from "@english-learn/storage-sqlite";
import { SQLiteProvider, useSQLiteContext } from "expo-sqlite";
import { useMemo, type ReactNode } from "react";
import { systemClock } from "../clock/system-clock";
import { AppServicesProvider, type AppServices } from "../services/app-services";

export const DATABASE_NAME = "english-learn.db";

function SqliteServices({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const services = useMemo<AppServices>(
    () => ({ progressRepository: createSqliteProgressRepository(db), clock: systemClock }),
    [db],
  );
  return <AppServicesProvider services={services}>{children}</AppServicesProvider>;
}

/** Opens the on-device database, runs migrations, and provides the app services. */
export function SqliteAppServicesProvider({ children }: { children: ReactNode }) {
  return (
    <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrate}>
      <SqliteServices>{children}</SqliteServices>
    </SQLiteProvider>
  );
}
