import {
  IMPORT_PATH,
  decideVisit,
  importUrl,
  readTransferToken,
  repeatUrl,
  type OriginMove,
} from "./origin-move";

const move: OriginMove = {
  oldOrigin: "https://english-learn-iwl.pages.dev",
  newOrigin: "https://english.maumar.com.ar",
};

function at(href: string) {
  const { origin, pathname, search, hash } = new URL(href);
  return { origin, pathname, search, hash };
}

describe("decideVisit", () => {
  it("runs the app as usual anywhere but the old address", () => {
    for (const href of ["https://english.maumar.com.ar/", "http://localhost:8081/review"]) {
      expect(
        decideVisit({ move, location: at(href), migratedTo: null, hasProgress: true }),
      ).toEqual({ kind: "app" });
    }
  });

  it("offers to take the progress along when the old address has some", () => {
    expect(
      decideVisit({
        move,
        location: at("https://english-learn-iwl.pages.dev/"),
        migratedTo: null,
        hasProgress: true,
      }),
    ).toEqual({ kind: "offer" });
  });

  it("sends a learner without progress to the same page on the new address", () => {
    expect(
      decideVisit({
        move,
        location: at("https://english-learn-iwl.pages.dev/lesson/a2.food?x=1#top"),
        migratedTo: null,
        hasProgress: false,
      }),
    ).toEqual({ kind: "redirect", url: "https://english.maumar.com.ar/lesson/a2.food?x=1#top" });
  });

  it("sends a learner whose progress already moved to where it went", () => {
    expect(
      decideVisit({
        move,
        location: at("https://english-learn-iwl.pages.dev/review"),
        migratedTo: "https://english.maumar.com.ar",
        hasProgress: true,
      }),
    ).toEqual({ kind: "redirect", url: "https://english.maumar.com.ar/review" });
  });

  it("offers the move again when asked to repeat it (the link expired or was used)", () => {
    const location = at("https://english-learn-iwl.pages.dev/?transferir=1");

    expect(decideVisit({ move, location, migratedTo: move.newOrigin, hasProgress: true })).toEqual({
      kind: "offer",
    });
    expect(decideVisit({ move, location, migratedTo: null, hasProgress: false })).toEqual({
      kind: "redirect",
      url: "https://english.maumar.com.ar/",
    });
  });
});

describe("transfer links", () => {
  it("carries the token in the fragment of the import page", () => {
    expect(IMPORT_PATH).toBe("/importar");
    expect(importUrl(move.newOrigin, "abc_DEF-123")).toBe(
      "https://english.maumar.com.ar/importar#t=abc_DEF-123",
    );
  });

  it("reads the token back from the fragment", () => {
    expect(readTransferToken("#t=abc_DEF-123")).toBe("abc_DEF-123");
    expect(readTransferToken("#t=")).toBeNull();
    expect(readTransferToken("")).toBeNull();
    expect(readTransferToken("#id_token=x")).toBeNull();
  });

  it("links back to the old address to repeat the move", () => {
    expect(repeatUrl(move.oldOrigin)).toBe("https://english-learn-iwl.pages.dev/?transferir=1");
  });
});
