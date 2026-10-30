import { SchemaTooNewError } from "@english-learn/storage-sqlite";
import { DatabaseOpenError, databaseOpenErrorKind } from "./database-open-error";

describe("databaseOpenErrorKind", () => {
  // Messages observed when a second tab opens the app while the first one holds the database
  // (expo-sqlite web keeps OPFS sync access handles open; only one tab can hold them).
  it.each([
    // Chromium
    "Failed to execute 'createSyncAccessHandle' on 'FileSystemFileHandle': Access Handles cannot be created if there is another open Access Handle or Writable stream associated with the same file.",
    // WebKit (Safari)
    "The object is in an invalid state.",
    // Firefox and the DOMException name, in case a browser forwards it
    "NoModificationAllowedError: the file is locked",
  ])("recognizes the database being open in another tab: %s", (message) => {
    expect(databaseOpenErrorKind(new Error(message))).toBe("open-elsewhere");
  });

  it("recognizes a database written by a newer app version", () => {
    expect(databaseOpenErrorKind(new SchemaTooNewError(3, 1))).toBe("too-new");
  });

  it.each([
    new Error("The operation failed for an unknown transient reason (e.g. out of memory)."),
    new Error("database disk image is malformed"),
    "not an error",
  ])("treats anything else as unavailable: %s", (error) => {
    expect(databaseOpenErrorKind(error)).toBe("unavailable");
  });
});

describe("DatabaseOpenError", () => {
  it("keeps the original error as its cause and classifies it", () => {
    const cause = new Error("The object is in an invalid state.");

    const error = new DatabaseOpenError(cause);

    expect(error).toBeInstanceOf(Error);
    expect(error.cause).toBe(cause);
    expect(error.kind).toBe("open-elsewhere");
    expect(error.message).toContain("The object is in an invalid state.");
  });
});
