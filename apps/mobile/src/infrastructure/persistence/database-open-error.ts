import { SchemaTooNewError } from "@english-learn/storage-sqlite";

/**
 * Why the on-device database could not be opened:
 * - "open-elsewhere": (web) another tab of the app holds the database. expo-sqlite keeps OPFS
 *   sync access handles open for the whole session and a file accepts only one, so a second tab
 *   fails to open it.
 * - "too-new": the database was written by a newer app version (see `SchemaTooNewError`).
 * - "unavailable": anything else (storage disabled, e.g. WebKit private browsing; corrupt file).
 */
export type DatabaseOpenErrorKind = "open-elsewhere" | "too-new" | "unavailable";

// The browser error reaches the page from the SQLite worker as a plain `Error` (the DOMException
// name is lost), so it is recognized by message. Observed messages:
// - Chromium: "... Access Handles cannot be created if there is another open Access Handle ..."
// - WebKit (Safari): "The object is in an invalid state." (InvalidStateError)
const OPEN_ELSEWHERE =
  /another open Access Handle|NoModificationAllowedError|The object is in an invalid state/i;

export function databaseOpenErrorKind(error: unknown): DatabaseOpenErrorKind {
  if (error instanceof SchemaTooNewError) return "too-new";
  if (error instanceof Error && OPEN_ELSEWHERE.test(`${error.name}: ${error.message}`)) {
    return "open-elsewhere";
  }
  return "unavailable";
}

/**
 * A short code for "Detalles técnicos": which browser error made the open fail (the worker loses
 * the DOMException name, so it is recovered from the message). No paths or personal data.
 */
export function openFailureCode(error: unknown): string {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  if (/another open Access Handle/i.test(text)) return "open-failed:AccessHandleBusy";
  if (/NoModificationAllowedError/i.test(text)) return "open-failed:NoModificationAllowedError";
  if (/invalid state/i.test(text)) return "open-failed:InvalidStateError";
  return `open-failed:${error instanceof Error ? error.name : "Unknown"}`;
}

/** Thrown when the database fails to open or migrate; caught by `AppErrorBoundary`. */
export class DatabaseOpenError extends Error {
  readonly kind: DatabaseOpenErrorKind;

  constructor(cause: unknown) {
    super(
      `Could not open the database: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
    this.name = "DatabaseOpenError";
    this.kind = databaseOpenErrorKind(cause);
  }
}
