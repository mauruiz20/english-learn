import { previousScreenOfTheApp } from "./back-to-previous-screen";

const ORIGIN = "https://english.maumar.com.ar";
const entry = (url: string | null, index: number) => ({ url, index });

function navigation(urls: (string | null)[], current: number) {
  const entries = urls.map(entry);
  return { currentEntry: entries[current] ?? null, entries: () => entries };
}

describe("previousScreenOfTheApp", () => {
  it("finds the screen this window showed before, on the app's own address", () => {
    expect(previousScreenOfTheApp(navigation([`${ORIGIN}/cuenta`, `${ORIGIN}/`], 1), ORIGIN)).toBe(
      true,
    );
  });

  it("not on the first screen of the window", () => {
    expect(previousScreenOfTheApp(navigation([`${ORIGIN}/`], 0), ORIGIN)).toBe(false);
  });

  it("never another site (Google), nor an entry whose address is unknown", () => {
    expect(
      previousScreenOfTheApp(
        navigation(["https://accounts.google.com/x", `${ORIGIN}/`], 1),
        ORIGIN,
      ),
    ).toBe(false);
    expect(previousScreenOfTheApp(navigation([null, `${ORIGIN}/`], 1), ORIGIN)).toBe(false);
  });

  it("without the Navigation API (no positive evidence) offers nothing", () => {
    expect(previousScreenOfTheApp(undefined, ORIGIN)).toBe(false);
    expect(previousScreenOfTheApp({ currentEntry: null, entries: () => [] }, ORIGIN)).toBe(false);
  });
});
