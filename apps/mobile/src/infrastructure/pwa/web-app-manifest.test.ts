import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { palettes } from "@/shared/ui/theme";

const PUBLIC = join(__dirname, "../../../public");

type ManifestIcon = { src: string; sizes: string; type: string; purpose: string };

const manifest = JSON.parse(readFileSync(join(PUBLIC, "manifest.webmanifest"), "utf8")) as {
  name: string;
  short_name: string;
  lang: string;
  start_url: string;
  scope: string;
  display: string;
  theme_color: string;
  background_color: string;
  icons: ManifestIcon[];
};
const html = readFileSync(join(PUBLIC, "index.html"), "utf8");

describe("web app manifest", () => {
  it("names the app and opens it standalone at the root", () => {
    expect(manifest).toMatchObject({
      name: "English Learn",
      short_name: "English",
      lang: "es",
      start_url: "/",
      scope: "/",
      display: "standalone",
    });
  });

  it("uses the light paper color, like the first paint", () => {
    expect(manifest.theme_color).toBe(palettes.light.paper);
    expect(manifest.background_color).toBe(palettes.light.paper);
  });

  it("lists 192 and 512 px icons, a maskable one included, that exist in public/", () => {
    expect(manifest.icons.map((icon) => `${icon.sizes} ${icon.purpose}`)).toEqual([
      "192x192 any",
      "512x512 any",
      "512x512 maskable",
    ]);
    for (const icon of manifest.icons) {
      expect(icon.type).toBe("image/png");
      expect(existsSync(join(PUBLIC, icon.src))).toBe(true);
    }
  });
});

describe("index.html", () => {
  it("links the manifest and the iOS home screen icon", () => {
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
    expect(html).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png" />');
    expect(existsSync(join(PUBLIC, "apple-touch-icon.png"))).toBe(true);
    expect(html).toContain('<meta name="apple-mobile-web-app-capable" content="yes" />');
    expect(html).toContain('<html lang="es">');
  });

  it("colors the browser chrome with the paper of each scheme", () => {
    expect(html).toContain(
      `<meta name="theme-color" content="${palettes.light.paper}" media="(prefers-color-scheme: light)" />`,
    );
    expect(html).toContain(
      `<meta name="theme-color" content="${palettes.dark.paper}" media="(prefers-color-scheme: dark)" />`,
    );
  });
});

/** Cloudflare Pages `_headers`: a path line, then indented `Name: value` lines. */
function parseHeaders(source: string): Map<string, Record<string, string>> {
  const rules = new Map<string, Record<string, string>>();
  let current: Record<string, string> | undefined;
  for (const line of source.split("\n")) {
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    if (!line.startsWith(" ")) {
      current = {};
      rules.set(line.trim(), current);
    } else if (current !== undefined) {
      const [name, ...value] = line.trim().split(":");
      current[(name ?? "").trim()] = value.join(":").trim();
    }
  }
  return rules;
}

describe("_headers (Cloudflare Pages)", () => {
  const rules = parseHeaders(readFileSync(join(PUBLIC, "_headers"), "utf8"));

  it("cross-origin isolates every path, the service worker included", () => {
    expect(rules.get("/*")).toEqual({
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Opener-Policy": "same-origin",
    });
  });

  it("revalidates the shell, the service worker and the manifest so deploys propagate", () => {
    for (const path of ["/", "/index.html", "/sw.js", "/manifest.webmanifest"]) {
      expect(rules.get(path)).toEqual({ "Cache-Control": "no-cache" });
    }
  });
});
