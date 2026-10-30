import { useEffect } from "react";
import { Platform } from "react-native";
import { palettes } from "./theme";

const STYLE_ID = "notebook-global-styles";

/** Visible keyboard focus ring in ink, and the paper color behind the app (no white flash). */
export const WEB_GLOBAL_CSS = `
:root { --paper: ${palettes.light.paper}; --focus: ${palettes.light.ink}; color-scheme: light dark; }
@media (prefers-color-scheme: dark) {
  :root { --paper: ${palettes.dark.paper}; --focus: ${palettes.dark.ink}; }
}
html, body { background-color: var(--paper); }
:focus { outline: none; }
:focus-visible { outline: 2px solid var(--focus) !important; outline-offset: 3px; border-radius: 4px; }
`;

/** Adds the app's global CSS on web (once); does nothing on native. */
export function useWebGlobalStyles() {
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    if (document.getElementById(STYLE_ID) !== null) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = WEB_GLOBAL_CSS;
    document.head.appendChild(style);
  }, []);
}
