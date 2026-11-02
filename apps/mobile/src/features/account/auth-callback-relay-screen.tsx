import { useEffect, useRef, useState } from "react";
import { ActivityIndicator } from "react-native";
import {
  COMPLETE_PATH,
  browserRelayChannel,
  createCallbackStash,
  handOffCallback,
} from "@/infrastructure/auth/callback-relay";
import { CALLBACK_PATH } from "@/infrastructure/auth/oidc";
import { ScreenContainer } from "@/shared/ui/screen-container";
import { Text } from "@/shared/ui/text";
import { useTheme } from "@/shared/ui/use-theme";

const browserFragment = () => (typeof window === "undefined" ? "" : window.location.hash);
/** Drops `#id_token=…` from the address bar and the history entry. */
const clearBrowserFragment = () => {
  if (typeof window !== "undefined") window.history.replaceState(null, "", CALLBACK_PATH);
};
const browserHandOff = (fragment: string) =>
  handOffCallback({
    fragment,
    stash: createCallbackStash(window.localStorage),
    channel: browserRelayChannel(),
  });
/** A full page load: the app (and its database) boots at `/auth/completar`. */
const completeInThisTab = () => window.location.replace(COMPLETE_PATH);
const closeBrowserWindow = () => {
  try {
    window.close();
  } catch {
    // Not a window this page may close: the message stays.
  }
};

/**
 * `/auth/callback`: where Google sends the learner back. It runs WITHOUT the database (see
 * `callback-relay.ts`): it removes the token from history, hands it to the app window that
 * started the sign-in, or continues in this tab at `/auth/completar`.
 */
export function AuthCallbackRelayScreen({
  readFragment = browserFragment,
  clearFragment = clearBrowserFragment,
  handOff = browserHandOff,
  continueHere = completeInThisTab,
  closeWindow = closeBrowserWindow,
}: {
  readFragment?: () => string;
  clearFragment?: () => void;
  handOff?: (fragment: string) => Promise<"taken" | "here">;
  continueHere?: () => void;
  closeWindow?: () => void;
}) {
  const { colors } = useTheme();
  const [taken, setTaken] = useState(false);
  // Once per page (StrictMode runs effects twice).
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const fragment = readFragment();
    clearFragment();
    void handOff(fragment).then((result) => {
      if (result === "here") {
        continueHere();
        return;
      }
      setTaken(true);
      closeWindow();
    });
  }, [readFragment, clearFragment, handOff, continueHere, closeWindow]);

  if (taken) {
    return (
      <ScreenContainer title="Listo" insetTop>
        <Text>Vuelve a la app para seguir: allí terminamos de entrar con Google.</Text>
      </ScreenContainer>
    );
  }
  return (
    <ScreenContainer title="Cuenta" insetTop>
      <ActivityIndicator accessibilityLabel="Entrando con Google" color={colors.ink} />
    </ScreenContainer>
  );
}
