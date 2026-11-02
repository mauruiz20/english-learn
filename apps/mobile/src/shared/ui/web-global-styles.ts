import { useEffect } from "react";
import { Platform } from "react-native";
import { palettes, type ColorScheme } from "./theme";

const STYLE_ID = "notebook-global-styles";

/**
 * Visible keyboard focus ring in ink, and the paper color behind the app (no white flash). The
 * scheme comes from `<html data-theme>`, which index.html's boot script sets before the first
 * paint and `useWebDocumentTheme` keeps up to date; the system scheme only applies before then.
 */
export const WEB_GLOBAL_CSS = `
:root { --paper: ${palettes.light.paper}; --focus: ${palettes.light.ink}; color-scheme: light; }
:root[data-theme="dark"] { --paper: ${palettes.dark.paper}; --focus: ${palettes.dark.ink}; color-scheme: dark; }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) { --paper: ${palettes.dark.paper}; --focus: ${palettes.dark.ink}; color-scheme: dark; }
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

/** Marks the page with the scheme it shows and colors the browser chrome with its paper. */
export function applyDocumentTheme(doc: Document, scheme: ColorScheme): void {
  doc.documentElement.setAttribute("data-theme", scheme);
  doc.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    meta.setAttribute("content", palettes[scheme].paper);
  });
}

/** Web: keeps `<html data-theme>` and the theme-color in step with the scheme the app shows. */
export function useWebDocumentTheme(scheme: ColorScheme) {
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    applyDocumentTheme(document, scheme);
  }, [scheme]);
}
