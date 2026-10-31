import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { CALLBACK_PATH } from "@/infrastructure/auth/oidc";
import { Button } from "@/shared/ui/button";
import { ScreenContainer } from "@/shared/ui/screen-container";
import { Text } from "@/shared/ui/text";
import { spacing } from "@/shared/ui/theme";
import { useTheme } from "@/shared/ui/use-theme";
import { useAccount } from "./account-context";
import { CallbackError, type CallbackFailureReason } from "./application/account-controller";

const MESSAGES: Readonly<Record<CallbackFailureReason, string>> = {
  state:
    "No pudimos verificar este ingreso (puede haber vencido o venir de otra pestaña). Volvé a intentarlo desde Cuenta.",
  cancelled: "No se completó el ingreso con Google. Podés intentarlo de nuevo cuando quieras.",
  api: "No pudimos conectar con el servidor para entrar. Revisá tu conexión e intentá de nuevo.",
  "wrong-account":
    "Entraste con otra cuenta de Google, así que no eliminamos nada. Para eliminar tu cuenta, elegí la misma cuenta con la que la creaste.",
};

const browserFragment = () => (typeof window === "undefined" ? "" : window.location.hash);
/** Drops `#id_token=…` from the address bar and the history entry. */
const clearBrowserFragment = () => {
  if (typeof window !== "undefined") window.history.replaceState(null, "", CALLBACK_PATH);
};

/**
 * `/auth/callback`: where Google sends the learner back with the ID token in the URL fragment
 * (the fragment never reaches a server or the service worker). It removes the fragment from
 * history before anything else, completes the sign-in and returns to where the learner was.
 */
export function AuthCallbackScreen({
  readFragment = browserFragment,
  clearFragment = clearBrowserFragment,
}: {
  readFragment?: () => string;
  clearFragment?: () => void;
}) {
  const router = useRouter();
  const { actions } = useAccount();
  const { colors } = useTheme();
  const [failure, setFailure] = useState<CallbackFailureReason | null>(
    actions === null ? "state" : null,
  );
  // Once per page: the token in the fragment is single-use (StrictMode runs effects twice).
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const fragment = readFragment();
    clearFragment();
    // Without an account (another site, native) the failure message is already shown.
    if (actions === null) return;
    actions.completeSignIn(fragment).then(
      (returnTo) => router.replace(returnTo as Parameters<typeof router.replace>[0]),
      (error: unknown) => {
        console.error("Google sign-in failed", error);
        setFailure(error instanceof CallbackError ? error.reason : "api");
      },
    );
  }, [actions, readFragment, clearFragment, router]);

  if (failure === null) {
    return (
      <ScreenContainer title="Cuenta">
        <ActivityIndicator accessibilityLabel="Entrando con Google" color={colors.ink} />
      </ScreenContainer>
    );
  }
  return (
    <ScreenContainer title="Cuenta">
      <View style={styles.body}>
        <Text accessibilityRole="alert">{MESSAGES[failure]}</Text>
        <Button label="Volver a Cuenta" onPress={() => router.replace("/cuenta")} />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({ body: { gap: spacing.md } });
