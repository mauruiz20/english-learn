import type { ApiClient } from "@english-learn/api-client";
import type { Corpus } from "@english-learn/content";
import { corpus } from "@english-learn/content/corpus";
import { isStreakAlive } from "@english-learn/domain";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { isLessonDone } from "@/features/lesson/model/lesson-catalog";
import { useAppServices } from "@/infrastructure/services/app-services";
import { createTransferApi, originMove } from "@/infrastructure/transfer/transfer-config";
import { Button } from "@/shared/ui/button";
import { formatDays } from "@/shared/ui/format";
import { ScreenContainer } from "@/shared/ui/screen-container";
import { Sticker } from "@/shared/ui/sticker";
import { Text } from "@/shared/ui/text";
import { spacing } from "@/shared/ui/theme";
import { useTheme } from "@/shared/ui/use-theme";
import {
  TransferError,
  createProgressReceiver,
  type TransferFailure,
} from "./application/transfer-progress";
import { failureText } from "./model/failure-text";
import { IMPORT_PATH, readTransferToken, repeatUrl } from "./model/origin-move";

type Summary = { readonly xp: number; readonly streakDays: number; readonly lessonsDone: number };

type ImportState =
  | { readonly status: "importing" }
  | { readonly status: "done"; readonly summary: Summary }
  /** `missing`: no token in the link; `storage`: claimed but not saved on this device. */
  | { readonly status: "failed"; readonly failure: TransferFailure | "missing" | "storage" };

const browserFragment = () => (typeof window === "undefined" ? "" : window.location.hash);
/** Drops `#t=…` from the address bar and the history entry. */
const clearBrowserFragment = () => {
  if (typeof window !== "undefined") window.history.replaceState(null, "", IMPORT_PATH);
};

function failureMessage(failure: TransferFailure | "missing" | "storage"): string {
  if (failure === "missing") {
    return "Este enlace no trae progreso para importar. Para llevar tu progreso, ábrelo desde el sitio anterior.";
  }
  if (failure === "storage") {
    return "No pudimos guardar tu progreso en este dispositivo. Vuelve a intentarlo.";
  }
  return failureText(failure);
}

/**
 * `/importar` on the new web address: where the old one sends the learner with a transfer token
 * in the URL fragment (it never reaches a server or the service worker). The fragment leaves the
 * address bar and history first; then the transfer is claimed (once) and its events are saved as
 * this device's own, unsynced, so a signed-in learner's next sync uploads them. Shows what arrived.
 */
export function ImportScreen({
  readFragment = browserFragment,
  clearFragment = clearBrowserFragment,
  api,
  oldOrigin,
  assign = (url) => window.location.assign(url),
  content = corpus,
}: {
  readFragment?: () => string;
  clearFragment?: () => void;
  api?: Pick<ApiClient, "claimTransfer">;
  /** Where to repeat the move when the link expired; the app's old address by default. */
  oldOrigin?: string;
  assign?: (url: string) => void;
  content?: Pick<Corpus, "lessons" | "exercisesById">;
}) {
  const router = useRouter();
  const { colors } = useTheme();
  const { progressRepository, clock, deviceId, transfer, account } = useAppServices();
  const [state, setState] = useState<ImportState>({ status: "importing" });
  const [receive] = useState(() =>
    transfer === undefined
      ? null
      : createProgressReceiver({ api: api ?? createTransferApi(), store: transfer, deviceId }),
  );
  const token = useRef<string | null>(null);
  // Once per page: the token is single-use (StrictMode runs effects twice).
  const started = useRef(false);

  const run = useCallback(async () => {
    if (receive === null || token.current === null) {
      setState({ status: "failed", failure: "missing" });
      return;
    }
    setState({ status: "importing" });
    try {
      await receive(token.current);
    } catch (error) {
      console.error("Failed to import the transferred progress", error);
      setState({
        status: "failed",
        failure: error instanceof TransferError ? error.failure : "storage",
      });
      return;
    }
    // Like a saved session: a signed-in learner's sync uploads the new events.
    account?.localChanges.emit();
    try {
      const [xp, streak, states] = await Promise.all([
        progressRepository.getXp(),
        progressRepository.getStreak(),
        progressRepository.getReviewStates(),
      ]);
      const reviewed = new Set(states.map((s) => s.itemId));
      setState({
        status: "done",
        summary: {
          xp,
          streakDays: isStreakAlive(streak, clock.today()) ? streak.current : 0,
          lessonsDone: content.lessons.filter((l) =>
            isLessonDone(l, content.exercisesById, reviewed),
          ).length,
        },
      });
    } catch (error) {
      console.error("Failed to read the imported progress", error);
      setState({ status: "done", summary: { xp: 0, streakDays: 0, lessonsDone: 0 } });
    }
  }, [receive, account, progressRepository, clock, content]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const fragment = readFragment();
    clearFragment();
    token.current = readTransferToken(fragment);
    void run();
  }, [readFragment, clearFragment, run]);

  const home = () => router.replace("/");

  if (state.status === "importing") {
    return (
      <ScreenContainer title="Importar progreso">
        <ActivityIndicator accessibilityLabel="Trayendo tu progreso" color={colors.ink} />
      </ScreenContainer>
    );
  }

  if (state.status === "failed") {
    const { failure } = state;
    const expired =
      failure !== "missing" && failure !== "storage" && failure.reason === "not-found";
    const retryable = failure !== "missing" && !expired;
    return (
      <ScreenContainer title="Importar progreso">
        <View style={styles.body}>
          <Text accessibilityRole="alert">{failureMessage(failure)}</Text>
          {expired && (
            <Button
              label="Volver al sitio anterior"
              onPress={() => assign(repeatUrl(oldOrigin ?? originMove().oldOrigin))}
            />
          )}
          {retryable && <Button label="Reintentar" onPress={() => void run()} />}
          <Button label="Ir al inicio" variant="text" onPress={home} />
        </View>
      </ScreenContainer>
    );
  }

  const { summary } = state;
  return (
    <ScreenContainer title="Importar progreso">
      <View style={styles.body}>
        <View style={styles.header}>
          <Sticker color="green" size={48} tilt={-6} />
          <Text variant="title" accessibilityRole="header">
            ¡Tu progreso llegó!
          </Text>
        </View>
        <View style={styles.facts}>
          <Text variant="bodyStrong">{`${summary.xp} XP`}</Text>
          <Text>{`Racha: ${formatDays(summary.streakDays)}`}</Text>
          <Text>{`Lecciones completadas: ${summary.lessonsDone}`}</Text>
        </View>
        <Button label="Ir al inicio" onPress={home} />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.md },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  facts: { gap: spacing.xs },
});
