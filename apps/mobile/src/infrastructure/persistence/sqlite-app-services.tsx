import { createSqliteProgressRepository, migrate } from "@english-learn/storage-sqlite";
import { SQLiteProvider, useSQLiteContext } from "expo-sqlite";
import { useMemo, useState, type ReactNode } from "react";
import { createAppClock } from "../clock/app-clock";
import { AppServicesProvider, type AppServices } from "../services/app-services";

export const DATABASE_NAME = "english-learn.db";

function SqliteServices({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  // Read once per page load (an e2e `?today=` override must survive in-app navigation).
  const [clock] = useState(createAppClock);
  const services = useMemo<AppServices>(
    () => ({
      progressRepository: createSqliteProgressRepository(db),
      clock,
      random: Math.random,
    }),
    [db, clock],
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
