import { Component, useEffect, type ErrorInfo, type ReactNode } from "react";
import { startBackgroundRetry } from "@/infrastructure/persistence/background-retry";
import {
  DatabaseOpenError,
  openFailureCode,
} from "@/infrastructure/persistence/database-open-error";
import { browserEnvironment } from "@/infrastructure/persistence/ownership/ownership-environment";
import {
  BusyFilesHelp,
  STUCK_TITLE,
  TechnicalDetails,
  environmentLines,
} from "@/infrastructure/persistence/ownership/ownership-screens";
import { Button } from "@/shared/ui/button";
import { ScreenContainer } from "@/shared/ui/screen-container";
import { Text } from "@/shared/ui/text";

type Message = { readonly title: string; readonly detail: string };

function messageFor(error: unknown): Message {
  if (error instanceof DatabaseOpenError) {
    switch (error.kind) {
      case "too-new":
        return {
          title: "Tus datos se guardaron con una versión más nueva de la app.",
          detail: "Actualiza la app para continuar.",
        };
      case "unavailable":
        return {
          title: "No pudimos abrir tus datos.",
          detail:
            "Vuelve a intentarlo. En el navegador, la navegación privada puede impedir guardar datos.",
        };
    }
  }
  return { title: "Algo salió mal.", detail: "Vuelve a intentarlo." };
}

type AppErrorBoundaryProps = {
  children: ReactNode;
  onRetry: () => void;
  /** Extra "Detalles técnicos" lines for a database open that failed (workers, retries). */
  details?: () => readonly string[];
  /**
   * For files that stayed busy (web): how to try again on its own from the error screen, or
   * undefined when it must not (another failure, two workers, no attempt counter).
   */
  backgroundRetry?: () => (() => void) | undefined;
};

/** Files held after the whole wait: the help, and (web) another try whenever it may work. */
function BusyFilesScreen({
  error,
  onRetry,
  retryInBackground,
  details,
}: {
  error: DatabaseOpenError;
  onRetry: () => void;
  retryInBackground: (() => void) | undefined;
  details: readonly string[];
}) {
  useEffect(() => {
    if (retryInBackground === undefined) return;
    return startBackgroundRetry({ retry: retryInBackground });
  }, [retryInBackground]);
  return (
    <ScreenContainer title={STUCK_TITLE} insetTop>
      <BusyFilesHelp retryingOnItsOwn={retryInBackground !== undefined} />
      <Button label="Reintentar" onPress={onRetry} />
      <TechnicalDetails
        lines={[
          `Motivo: ${openFailureCode(error.cause)}`,
          ...environmentLines(browserEnvironment()),
          ...details,
          `Hora: ${new Date().toISOString()}`,
        ]}
      />
    </ScreenContainer>
  );
}

/**
 * Catches render errors anywhere below it (including a database that fails to open, see
 * `SqliteAppServicesProvider`) and shows a message with "Reintentar" instead of a blank screen.
 * `onRetry` decides how to retry (reload the page, or remount the app).
 */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, { error: unknown }> {
  override state: { error: unknown } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("Unhandled app error", error, info.componentStack);
  }

  override render() {
    if (this.state.error === null) return this.props.children;
    const { error } = this.state;
    // The files are held by something that never let go (on iOS, often with no other tab
    // at all, stale handles in the storage process): how to free them, the code for a
    // screenshot and, on web, another try on its own whenever the page comes back.
    if (error instanceof DatabaseOpenError && error.kind === "open-elsewhere") {
      return (
        <BusyFilesScreen
          error={error}
          onRetry={this.props.onRetry}
          retryInBackground={this.props.backgroundRetry?.()}
          details={this.props.details?.() ?? []}
        />
      );
    }
    const { title, detail } = messageFor(error);
    return (
      <ScreenContainer title={title} insetTop>
        <Text>{detail}</Text>
        <Button label="Reintentar" onPress={this.props.onRetry} />
      </ScreenContainer>
    );
  }
}
