type NavigationEntry = { readonly url: string | null; readonly index: number };

/** The parts of the Navigation API (`window.navigation`) used here. */
export type NavigationHistory = {
  readonly currentEntry: NavigationEntry | null;
  entries(): readonly NavigationEntry[];
};

/**
 * Whether this window has an earlier screen of the app itself to go back to (web), with
 * positive evidence only: the Navigation API lists the previous history entry, on `origin`.
 *
 * Why the busy-files screen offers to go back there: on the owner's iPhone, the page that
 * redirected to Google stayed frozen in the back/forward cache holding the database files, and
 * Back (restoring that page) made the app work at once, without a reboot. Builds since then let
 * go of the files before leaving, but a page frozen by an older build, or by a navigation the
 * app did not start, may still hold them.
 *
 * Never another site (Google's entry, if it stayed): going back there would leave the app.
 * Without the Navigation API there is no way to tell what Back leads to, so nothing is offered.
 */
export function previousScreenOfTheApp(
  navigation: NavigationHistory | undefined,
  origin: string,
): boolean {
  const current = navigation?.currentEntry;
  if (navigation === undefined || current === null || current === undefined) return false;
  if (current.index < 1) return false;
  const previous = navigation.entries().find((entry) => entry.index === current.index - 1);
  if (previous?.url === null || previous?.url === undefined) return false;
  try {
    return new URL(previous.url).origin === origin;
  } catch {
    return false;
  }
}
