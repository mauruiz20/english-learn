import type { Clock, ProgressRepository } from "@english-learn/domain";
import { createContext, use, type ReactNode } from "react";

/** Side-effect services features depend on. Injected so tests can pass in-memory fakes. */
export type AppServices = {
  readonly progressRepository: ProgressRepository;
  readonly clock: Clock;
};

const AppServicesContext = createContext<AppServices | null>(null);

export function AppServicesProvider({
  services,
  children,
}: {
  services: AppServices;
  children: ReactNode;
}) {
  return <AppServicesContext value={services}>{children}</AppServicesContext>;
}

export function useAppServices(): AppServices {
  const services = use(AppServicesContext);
  if (services === null) {
    throw new Error("useAppServices must be used inside <AppServicesProvider>");
  }
  return services;
}
