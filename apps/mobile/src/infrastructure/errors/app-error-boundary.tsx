import { Component, type ErrorInfo, type ReactNode } from "react";
import { DatabaseOpenError } from "@/infrastructure/persistence/database-open-error";
import { Button } from "@/shared/ui/button";
import { ScreenContainer } from "@/shared/ui/screen-container";
import { Text } from "@/shared/ui/text";

type Message = { readonly title: string; readonly detail: string };

function messageFor(error: unknown): Message {
  if (error instanceof DatabaseOpenError) {
    switch (error.kind) {
      case "open-elsewhere":
        return {
          title: "La app ya está abierta en otra pestaña.",
          detail: "Ciérrala y pulsa Reintentar.",
        };
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

type AppErrorBoundaryProps = { children: ReactNode; onRetry: () => void };

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
    const { title, detail } = messageFor(this.state.error);
    return (
      <ScreenContainer title={title} insetTop>
        <Text>{detail}</Text>
        <Button label="Reintentar" onPress={this.props.onRetry} />
      </ScreenContainer>
    );
  }
}
