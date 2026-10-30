/**
 * TEST-ONLY. `?rebuildProgress=1` on the page URL makes the app recompute its progress cache from
 * the event log at start, so Playwright can check progress really lives in the events. Wired in
 * only when the web build is exported with `EXPO_PUBLIC_E2E=1` (see `sqlite-app-services.tsx`).
 */
export function rebuildRequested(search: string): boolean {
  return new URLSearchParams(search).get("rebuildProgress") === "1";
}
