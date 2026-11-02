import { readFileSync } from "node:fs";
import { join } from "node:path";
import { palettes } from "./theme";
import { THEME_STORAGE_KEY } from "./theme-preference";
import { WEB_GLOBAL_CSS, applyDocumentTheme } from "./web-global-styles";

/** Just enough of a document: the <html> attributes and the theme-color metas. */
function fakeDocument() {
  const attributes = new Map<string, string>();
  // The light and dark theme-color metas, as index.html ships them.
  const metas = [palettes.light.paper, palettes.dark.paper].map((content) => ({
    content,
    setAttribute(name: string, value: string) {
      if (name === "content") this.content = value;
    },
  }));
  return {
    documentElement: {
      setAttribute: (name: string, value: string) => void attributes.set(name, value),
      getAttribute: (name: string) => attributes.get(name) ?? null,
    },
    querySelectorAll: (selector: string) => (selector === 'meta[name="theme-color"]' ? metas : []),
    theme: () => attributes.get("data-theme"),
    themeColors: () => metas.map((meta) => meta.content),
  };
}

describe("applyDocumentTheme", () => {
  it.each(["light", "dark"] as const)(
    "marks the page %s and colors the browser chrome with that paper",
    (scheme) => {
      const doc = fakeDocument();

      applyDocumentTheme(doc as unknown as Document, scheme);

      expect(doc.theme()).toBe(scheme);
      expect(doc.themeColors()).toEqual([palettes[scheme].paper, palettes[scheme].paper]);
    },
  );
});

describe("web global CSS", () => {
  it("drives the paper and focus colors from data-theme, the system only before it is set", () => {
    expect(WEB_GLOBAL_CSS).toContain(`:root[data-theme="dark"]`);
    expect(WEB_GLOBAL_CSS).toContain(":root:not([data-theme])");
  });
});

const html = readFileSync(join(__dirname, "../../../public/index.html"), "utf8");
const bootScript = /<script id="theme-boot">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "";

/** Runs the page's inline boot script with the given cache and system scheme. */
function boot({
  cached,
  systemDark,
  storageThrows = false,
}: {
  cached?: string | undefined;
  systemDark: boolean;
  storageThrows?: boolean;
}) {
  const doc = fakeDocument();
  const window = {
    get localStorage() {
      if (storageThrows) throw new Error("SecurityError");
      return { getItem: (key: string) => (key === THEME_STORAGE_KEY ? (cached ?? null) : null) };
    },
    matchMedia: (query: string) => ({
      matches: query === "(prefers-color-scheme: dark)" && systemDark,
    }),
  };
  new Function("window", "document", bootScript)(window, doc);
  return doc;
}

describe("index.html boot script (before the first paint)", () => {
  it("is inline in the page head, ahead of the app bundle", () => {
    expect(bootScript).not.toBe("");
    expect(html.indexOf('<script id="theme-boot">')).toBeLessThan(html.indexOf("</head>"));
  });

  it.each([
    ["dark", false, "dark"],
    ["light", true, "light"],
    ["system", true, "dark"],
    ["system", false, "light"],
    [undefined, true, "dark"],
    ["sepia", false, "light"],
  ] as const)("cached %p with a dark system %p applies %s", (cached, systemDark, scheme) => {
    const doc = boot({ cached, systemDark });
    expect(doc.theme()).toBe(scheme);
  });

  it("paints the browser chrome for a chosen scheme", () => {
    expect(boot({ cached: "dark", systemDark: false }).themeColors()).toEqual([
      palettes.dark.paper,
      palettes.dark.paper,
    ]);
    expect(boot({ cached: "light", systemDark: true }).themeColors()).toEqual([
      palettes.light.paper,
      palettes.light.paper,
    ]);
  });

  it("follows the system when storage is blocked", () => {
    expect(boot({ systemDark: true, storageThrows: true }).theme()).toBe("dark");
  });
});
