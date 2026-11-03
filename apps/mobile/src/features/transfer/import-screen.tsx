import type { ApiClient } from "@english-learn/api-client";
import type { Corpus } from "@english-learn/content";
import { corpus } from "@english-learn/content/corpus";
import { isStreakAlive, type StoredEvent } from "@english-learn/domain";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useAccount } from "@/features/account/account-context";
import { isLessonDone } from "@/features/lesson/model/lesson-catalog";
import { leavePage } from "@/infrastructure/persistence/app-page-release";
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
  claimProgress,
  type TransferFailure,
} from "./application/transfer-progress";
import { failureText } from "./model/failure-text";
import { IMPORT_PATH, readTransferToken, repeatUrl } from "./model/origin-move";
import { activityRange, previewTransfer, type TransferPreview } from "./model/transfer-preview";

type Summary = { readonly xp: number; readonly streakDays: number; readonly lessonsDone: number };

type ImportState =
  | { readonly status: "claiming" }
  /** Claimed (the token is spent) and held in memory only: nothing is saved before "Importar". */
  | { readonly status: "confirm"; readonly preview: TransferPreview }
  | { readonly status: "saving" }
  | { readonly status: "done"; readonly summary: Summary }
  /** The learner declined: the claimed events were dropped and the link cannot be used again. */
  | { readonly status: "cancelled" }
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
 * address bar and history first; then the transfer is claimed (once) into memory and previewed.
 * Only when the learner confirms are its events saved as this device's own, unsynced, so a
 * signed-in learner's next sync uploads them; anyone can craft such a link, so nothing is written
 * without that confirmation.
 */
export function ImportScreen({
  readFragment = browserFragment,
  clearFragment = clearBrowserFragment,
  api,
  oldOrigin,
  // Through `leavePage`: the page lets go of its database first (see `createPageRelease`).
  assign = (url) => void leavePage(() => window.location.assign(url)),
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
  const { session } = useAccount();
  const [state, setState] = useState<ImportState>({ status: "claiming" });
  const [transferApi] = useState(() =>
    transfer === undefined ? null : (api ?? createTransferApi()),
  );
  const token = useRef<string | null>(null);
  /** The claimed events, kept until saved or declined: the token works only once. */
  const claimed = useRef<readonly StoredEvent[] | null>(null);
  // Once per page: the token is single-use (StrictMode runs effects twice).
  const started = useRef(false);

  const claim = useCallback(async () => {
    if (transferApi === null || token.current === null) {
      setState({ status: "failed", failure: "missing" });
      return;
    }
    setState({ status: "claiming" });
    try {
      claimed.current = await claimProgress({ api: transferApi, token: token.current, deviceId });
    } catch (error) {
      console.error("Failed to claim the transferred progress", error);
      setState({
        status: "failed",
        failure:
          error instanceof TransferError
            ? error.failure
            : { reason: "server", retryAfterSeconds: null },
      });
      return;
    }
    setState({
      status: "confirm",
      preview: previewTransfer(claimed.current, { today: clock.today(), content }),
    });
  }, [transferApi, deviceId, clock, content]);

  const save = useCallback(async () => {
    const events = claimed.current;
    if (transfer === undefined || events === null) return;
    setState({ status: "saving" });
    try {
      await transfer.importEvents(events);
    } catch (error) {
      console.error("Failed to import the transferred progress", error);
      setState({ status: "failed", failure: "storage" });
      return;
    }
    claimed.current = null;
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
  }, [transfer, account, progressRepository, clock, content]);

  const cancel = () => {
    claimed.current = null;
    setState({ status: "cancelled" });
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const fragment = readFragment();
    clearFragment();
    // Expo Router keeps the fragment as the `#` param and writes it back into the address bar
    // whenever it syncs the URL; an empty one is left out.
    router.setParams({ "#": "" });
    token.current = readTransferToken(fragment);
    void claim();
  }, [readFragment, clearFragment, claim, router]);

  const home = () => router.replace("/");
  const repeat = () => assign(repeatUrl(oldOrigin ?? originMove().oldOrigin));

  if (state.status === "claiming" || state.status === "saving") {
    return (
      <ScreenContainer title="Importar progreso">
        <ActivityIndicator
          accessibilityLabel={
            state.status === "claiming" ? "Trayendo tu progreso" : "Guardando tu progreso"
          }
          color={colors.ink}
        />
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
          {expired && <Button label="Volver al sitio anterior" onPress={repeat} />}
          {retryable && (
            <Button
              label="Reintentar"
              onPress={() => void (failure === "storage" ? save() : claim())}
            />
          )}
          <Button label="Ir al inicio" variant="text" onPress={home} />
        </View>
      </ScreenContainer>
    );
  }

  if (state.status === "confirm") {
    const { preview } = state;
    const range = activityRange(preview);
    return (
      <ScreenContainer title="Importar progreso">
        <View style={styles.body}>
          <Text variant="title" accessibilityRole="header">
            Progreso del sitio anterior
          </Text>
          <View style={styles.facts}>
            <Text variant="bodyStrong">{`${preview.xp} XP`}</Text>
            <Text>{`Lecciones completadas: ${preview.lessonsDone}`}</Text>
            <Text>{`Racha: ${formatDays(preview.streakDays)}`}</Text>
            {range !== null && <Text>{`Actividad: ${range}`}</Text>}
            <Text>{`Registros: ${preview.events}`}</Text>
          </View>
          <Text variant="bodyStrong">¿Importarlo a este dispositivo?</Text>
          {session.status === "signed-in" && (
            <Text>Como iniciaste sesión, este progreso también se sumará a tu cuenta.</Text>
          )}
          <Button label="Importar" onPress={() => void save()} />
          <Button label="Cancelar" variant="secondary" onPress={cancel} />
        </View>
      </ScreenContainer>
    );
  }

  if (state.status === "cancelled") {
    return (
      <ScreenContainer title="Importar progreso">
        <View style={styles.body}>
          <Text>
            No importamos nada. Este enlace ya se usó y no sirve otra vez: si quieres traer tu
            progreso, vuelve al sitio anterior y pulsa «Llevar mi progreso».
          </Text>
          <Button label="Volver al sitio anterior" onPress={repeat} />
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
