import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Button } from "@/shared/ui/button";
import { ScreenContainer } from "@/shared/ui/screen-container";
import { Text } from "@/shared/ui/text";
import { spacing } from "@/shared/ui/theme";
import type { OwnershipDiagnostics, OwnershipEnvironment } from "./database-ownership";

const yesNo = (value: boolean) => (value ? "sí" : "no");

export function environmentLines(environment: OwnershipEnvironment): string[] {
  return [
    `Web Locks: ${yesNo(environment.webLocks)} · BroadcastChannel: ${yesNo(
      environment.broadcastChannel,
    )} · OPFS: ${yesNo(environment.opfs)}`,
    `Modo: ${environment.displayMode}`,
  ];
}

/** "Detalles técnicos" for a screenshot: codes, browser features and timestamps only. */
export function diagnosticsLines(diagnostics: OwnershipDiagnostics): string[] {
  return [
    `Motivo: ${diagnostics.reason}`,
    ...environmentLines(diagnostics.environment),
    `Bloqueos activos: ${diagnostics.lockHolders ?? "desconocido"}`,
    `Intentos: ${diagnostics.takeOverAttempts}`,
    `Inicio: ${new Date(diagnostics.startedAt).toISOString()}`,
    `Decisión: ${new Date(diagnostics.decidedAt).toISOString()}`,
  ];
}

/** A collapsible block with short technical lines the learner can screenshot for support. */
export function TechnicalDetails({ lines }: { lines: readonly string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.details}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Detalles técnicos"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
      >
        <Text variant="smallStrong" tone="muted">
          {open ? "▾" : "▸"} Detalles técnicos
        </Text>
      </Pressable>
      {open &&
        lines.map((line) => (
          <Text key={line} variant="small" tone="muted" selectable>
            {line}
          </Text>
        ))}
    </View>
  );
}

type UseHereProps = { onUseHere: () => void };

/** Another tab or the installed app answered that it holds the database (web: one at a time). */
export function OpenElsewhereScreen({
  onUseHere,
  diagnostics,
}: UseHereProps & { diagnostics: OwnershipDiagnostics }) {
  return (
    <ScreenContainer title="La app está abierta en otra pestaña o ventana" insetTop>
      <Text>Puedes usarla aquí: la otra pestaña guarda lo que tenga pendiente y se pausa.</Text>
      <Button label="Usar aquí" onPress={onUseHere} />
      <TechnicalDetails lines={diagnosticsLines(diagnostics)} />
    </ScreenContainer>
  );
}

/** This tab handed the database to another one ("Usar aquí" there). */
export function ReleasedScreen({ onUseHere }: UseHereProps) {
  return (
    <ScreenContainer title="La app se abrió en otra pestaña" insetTop>
      <Text>Tu progreso está guardado. Para seguir en esta pestaña, pulsa Usar aquí.</Text>
      <Button label="Usar aquí" onPress={onUseHere} />
    </ScreenContainer>
  );
}

/**
 * A busy open waiting for its next try (web): calm and static (no spinner, so nothing moves
 * with reduced motion either) instead of a blank page or the error.
 */
export function OpeningDataScreen() {
  return (
    <ScreenContainer title="Abriendo tus datos…" insetTop>
      <Text accessibilityLiveRegion="polite">
        Tu progreso está guardado. Esto puede tardar unos segundos.
      </Text>
    </ScreenContainer>
  );
}

export const STUCK_TITLE = "No pudimos abrir tus datos en esta ventana.";

/** What to do when something keeps the data and never answers (iOS: close everything). */
export function StuckHelp() {
  return (
    <View style={styles.steps}>
      <Text>Tu progreso sigue guardado en este dispositivo. Para recuperarlo:</Text>
      <Text>1. Cierra la app por completo desde el selector de apps y vuelve a abrirla.</Text>
      <Text>2. Cierra también las pestañas de english.maumar.com.ar en Safari.</Text>
      <Text>3. Luego pulsa Reintentar.</Text>
    </View>
  );
}

/**
 * The page's own open found the files busy for the whole wait (on iOS, stale handles in the
 * storage process, often with no other tab at all). A restart of the iPhone is the proven fix.
 */
export function BusyFilesHelp({ retryingOnItsOwn }: { retryingOnItsOwn: boolean }) {
  return (
    <View style={styles.steps}>
      <Text>Tu progreso sigue guardado en este dispositivo.</Text>
      {retryingOnItsOwn && (
        <Text accessibilityLiveRegion="polite">
          Seguimos intentando: la app se abrirá sola en cuanto tus datos estén libres.
        </Text>
      )}
      <Text>Si no se abre en un rato:</Text>
      <Text>1. Cierra la app por completo desde el selector de apps y vuelve a abrirla.</Text>
      <Text>2. Cierra también las pestañas de english.maumar.com.ar en Safari.</Text>
      <Text>3. Si el problema sigue, reinicia el iPhone: así se liberan tus datos.</Text>
    </View>
  );
}

/**
 * Something holds the database and does not answer (a frozen or suspended page): "Usar aquí"
 * already failed, so offer the steps that free it and a longer "Reintentar" instead of a loop.
 */
export function DatabaseStuckScreen({
  onRetry,
  diagnostics,
}: {
  onRetry: () => void;
  diagnostics: OwnershipDiagnostics;
}) {
  return (
    <ScreenContainer title={STUCK_TITLE} insetTop>
      <StuckHelp />
      <Button label="Reintentar" onPress={onRetry} />
      <TechnicalDetails lines={diagnosticsLines(diagnostics)} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  details: { gap: spacing.xs, marginTop: spacing.md },
  steps: { gap: spacing.sm },
});
