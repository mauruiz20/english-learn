import { useEffect, useState } from "react";
import { AppState } from "react-native";

/**
 * Whether the app is in the foreground: on web, whether the browser tab is visible (React Native
 * Web's `AppState` follows `document.visibilityState`). Ambient motion (Avi's bob and blink)
 * stops while it is false, so a hidden tab or a backgrounded app spends no frames or timers.
 */
export function useAppVisible(): boolean {
  const [visible, setVisible] = useState(() => AppState.currentState !== "background");
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (status) =>
      setVisible(status !== "background"),
    );
    return () => subscription.remove();
  }, []);
  return visible;
}
