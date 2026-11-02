import { Component, type ErrorInfo, type ReactNode } from "react";
import {
  DatabaseOpenError,
  openFailureCode,
} from "@/infrastructure/persistence/database-open-error";
import { browserEnvironment } from "@/infrastructure/persistence/ownership/ownership-environment";
import {
  STUCK_TITLE,
  StuckHelp,
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
};

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
    // at all): the same help as the ownership gate's, with the code for a screenshot.
    if (error instanceof DatabaseOpenError && error.kind === "open-elsewhere") {
      return (
        <ScreenContainer title={STUCK_TITLE} insetTop>
          <StuckHelp />
          <Button label="Reintentar" onPress={this.props.onRetry} />
          <TechnicalDetails
            lines={[
              `Motivo: ${openFailureCode(error.cause)}`,
              ...environmentLines(browserEnvironment()),
              ...(this.props.details?.() ?? []),
              `Hora: ${new Date().toISOString()}`,
            ]}
          />
        </ScreenContainer>
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
