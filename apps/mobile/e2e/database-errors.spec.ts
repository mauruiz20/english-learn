import { test as ephemeral } from "@playwright/test";
import { expect, expectOneDatabaseWorker, test, type Page } from "./support/test";

const OPEN_ELSEWHERE = "La app está abierta en otra pestaña o ventana";
const RELEASED = "La app se abrió en otra pestaña";

test("a second tab takes the app over with 'Usar aquí', and the first one can take it back", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(page.getByText("0 XP", { exact: true })).toBeVisible();

  // Same browser profile: the first tab owns the database (OPFS access handles).
  const second = await context.newPage();
  await second.goto("/");
  await expect(second.getByRole("heading")).toHaveText(OPEN_ELSEWHERE);
  await second.getByRole("button", { name: "Usar aquí", exact: true }).click();
  await expect(second.getByText("0 XP", { exact: true })).toBeVisible({ timeout: 15_000 });

  // The first tab finished its writes, let go of the database and says so.
  await expect(page.getByRole("heading")).toHaveText(RELEASED);
  await page.bringToFront();
  await page.getByRole("button", { name: "Usar aquí", exact: true }).click();
  await expect(page.getByText("0 XP", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(second.getByRole("heading")).toHaveText(RELEASED);
});

test("reloading never shows the 'open in another tab' screen", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("0 XP", { exact: true })).toBeVisible();

  // The reloaded page starts while the previous page's SQLite worker still holds the files.
  for (let i = 0; i < 3; i++) {
    await page.reload();
    await expect(page.getByText("0 XP", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(OPEN_ELSEWHERE)).toHaveCount(0);
  }
});

// Playwright's default ephemeral contexts are what Safari Private Browsing looks like to WebKit:
// no OPFS. The app must explain it instead of showing a blank page.
ephemeral(
  "WebKit without persistent storage shows a message instead of a blank page",
  async ({ page, browserName }) => {
    ephemeral.skip(browserName !== "webkit", "Only WebKit disables OPFS in ephemeral contexts");

    await page.goto("/");

    await expect(page.getByRole("heading")).toHaveText("No pudimos abrir tus datos.");
    await expect(page.getByRole("button", { name: "Reintentar", exact: true })).toBeVisible();

    // "Reintentar" reloads the page (a failed SQLite worker never opens again): one worker on
    // the fresh page, never a second one next to the failed one.
    const reloaded = page.waitForEvent("load");
    await page.getByRole("button", { name: "Reintentar", exact: true }).click();
    await reloaded;
    await expect(page.getByRole("heading")).toHaveText("No pudimos abrir tus datos.");
    await expectOneDatabaseWorker(page);
  },
);

const STUCK = "No pudimos abrir tus datos en esta ventana.";

// iOS: a page that holds the database but never answers (frozen, suspended, another web view of
// the Home Screen app). 'Usar aquí' gets no answer: the help screen must follow, not a loop.
test("a holder that never answers: 'Usar aquí' once, then the help screen instead of a loop", async ({
  page,
  context,
}) => {
  test.setTimeout(60_000);
  // The holder's channel goes deaf and mute once `__frozen` is set (it keeps the lock and the
  // files, like a suspended page).
  await page.addInitScript(() => {
    const frozen = () => (window as unknown as { __frozen?: boolean }).__frozen === true;
    const Original = BroadcastChannel;
    window.BroadcastChannel = class extends Original {
      override postMessage(message: unknown) {
        if (!frozen()) super.postMessage(message);
      }
      override set onmessage(listener: ((event: MessageEvent) => void) | null) {
        super.onmessage = (event) => {
          if (!frozen()) listener?.(event);
        };
      }
      override get onmessage() {
        return super.onmessage;
      }
    } as typeof BroadcastChannel;
  });
  await page.goto("/");
  await expect(page.getByText("0 XP", { exact: true })).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { __frozen: boolean }).__frozen = true;
  });

  const second = await context.newPage();
  await second.goto("/");
  // Another client holds the owner lock: positive evidence, so "Usar aquí" is offered once.
  await expect(second.getByRole("heading")).toHaveText(OPEN_ELSEWHERE, { timeout: 15_000 });
  await second.getByRole("button", { name: "Usar aquí", exact: true }).click();

  await expect(second.getByRole("heading")).toHaveText(STUCK, { timeout: 20_000 });
  await expect(second.getByRole("button", { name: "Usar aquí" })).toHaveCount(0);
  await second.getByRole("button", { name: "Detalles técnicos", exact: true }).click();
  await expect(second.getByText("Motivo: no-owner-answer")).toBeVisible();
  await expect(second.getByText("Intentos: 1")).toBeVisible();

  // The frozen page goes away (the learner closed it): "Reintentar" gets the database.
  await page.close();
  await second.getByRole("button", { name: "Reintentar", exact: true }).click();
  await expect(second.getByText("0 XP", { exact: true })).toBeVisible({ timeout: 30_000 });
});

// Files held without the owner lock or any answer (what iOS showed, stale handles in its storage
// process): never "otra pestaña". The open waits calmly through the whole retry window, then
// explains how to free the data, keeps trying on its own and opens once the files are free,
// without the learner doing anything and without adding history entries.
test("files held longer than the wait: the help screen, then the app opens by itself", async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await expect(page.getByText("0 XP", { exact: true })).toBeVisible();
  // A non-app page of the origin grabs expo-sqlite's files from a worker, then the app closes.
  const holder = await context.newPage();
  await holder.goto("/metadata.json");
  await page.close();
  await holdDatabaseFiles(holder);
  const app = await context.newPage();
  await app.goto("/");
  const historyAtStart = await app.evaluate(() => history.length);

  // The wait shows a calm loading state, not the error.
  await expect(app.getByText("Abriendo tus datos…")).toBeVisible({ timeout: 15_000 });
  await expect(app.getByRole("heading")).toHaveText(STUCK, { timeout: 45_000 });
  await expect(app.getByText(OPEN_ELSEWHERE)).toHaveCount(0);
  await expect(app.getByText(/reinicia el iPhone/)).toBeVisible();
  await expect(app.getByText(/se abrirá sola/)).toBeVisible();
  await app.getByRole("button", { name: "Detalles técnicos", exact: true }).click();
  await expect(app.getByText(/^Motivo: open-failed:/)).toBeVisible();
  // It retried by reloading (backoff) before giving up, with one SQLite worker per page.
  await expect(app.getByText("Reintentos automáticos: 6")).toBeVisible();
  await expect(app.getByText("Workers de la base de datos: 1")).toBeVisible();
  await expect(app.getByText("Sondeo de archivos: no")).toBeVisible();
  const waited = await app.getByText(/^Espera total: /).textContent();
  expect(Number(waited?.match(/([\d,]+) s/)?.[1]?.replace(",", "."))).toBeGreaterThanOrEqual(15);

  // The files are released: the error screen's own retry opens the app, no press needed.
  await holder.evaluate(() => (window as unknown as { __holder: Worker }).__holder.terminate());
  await expect(app.getByText("0 XP", { exact: true })).toBeVisible({ timeout: 40_000 });
  await expectOneDatabaseWorker(app);
  expect(await app.evaluate(() => history.length)).toBe(historyAtStart);
  // Opened: the next failure starts a fresh round of retries and a fresh wait.
  expect(
    await app.evaluate(() => [
      sessionStorage.getItem("english-learn-db-open-retries"),
      sessionStorage.getItem("english-learn-db-open-retries-since"),
    ]),
  ).toEqual([null, null]);
});

test("the help screen retries at once when the app comes back to the foreground", async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await expect(page.getByText("0 XP", { exact: true })).toBeVisible();
  const holder = await context.newPage();
  await holder.goto("/metadata.json");
  await page.close();
  await holdDatabaseFiles(holder);
  const app = await context.newPage();
  await app.goto("/");
  await expect(app.getByRole("heading")).toHaveText(STUCK, { timeout: 45_000 });

  await holder.evaluate(() => (window as unknown as { __holder: Worker }).__holder.terminate());
  // What iOS sends when the Home Screen app returns (and a bfcache restore's `pageshow`).
  const reloaded = app.waitForEvent("load", { timeout: 5_000 });
  await app.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow")));
  await reloaded;
  await expect(app.getByText("0 XP", { exact: true })).toBeVisible({ timeout: 15_000 });
});

test("files held for about 8 s (late release): the app opens with no error screen", async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  // Records, across the retry reloads, whether the error screen ever showed.
  await context.addInitScript((stuck) => {
    setInterval(() => {
      if (document.body?.innerText.includes(stuck)) sessionStorage.setItem("e2e.saw-stuck", "1");
    }, 50);
  }, STUCK);
  await page.goto("/");
  await expect(page.getByText("0 XP", { exact: true })).toBeVisible();
  const holder = await context.newPage();
  await holder.goto("/metadata.json");
  await page.close();
  await holdDatabaseFiles(holder);

  const app = await context.newPage();
  await app.goto("/");
  const historyAtStart = await app.evaluate(() => history.length);
  await expect(app.getByText("Abriendo tus datos…")).toBeVisible({ timeout: 15_000 });
  await app.waitForTimeout(8_000);
  await holder.evaluate(() => (window as unknown as { __holder: Worker }).__holder.terminate());

  await expect(app.getByText("0 XP", { exact: true })).toBeVisible({ timeout: 30_000 });
  expect(await app.evaluate(() => sessionStorage.getItem("e2e.saw-stuck"))).toBeNull();
  await expectOneDatabaseWorker(app);
  // Retries reload in place: no history entries to go "back" through.
  expect(await app.evaluate(() => history.length)).toBe(historyAtStart);
  // Opened: the next failure starts a fresh round of retries.
  expect(await app.evaluate(() => sessionStorage.getItem("english-learn-db-open-retries"))).toBe(
    null,
  );
});

// iOS releases a closed or terminated worker's file handles later than desktop browsers. Older
// builds ran a file probe (its own worker taking a handle on every database file) moments before
// SQLite opened the same files: with a late release, the open failed with `InvalidStateError`
// (the iPhone's "No pudimos abrir tus datos en esta ventana."). Simulated here by delaying both.
test("file handles released late (as on iOS) never collide with the page's SQLite worker", async ({
  page,
}) => {
  await page.context().addInitScript(() => {
    const LATE_MS = 1500;
    const terminate = Worker.prototype.terminate;
    Worker.prototype.terminate = function (this: Worker) {
      setTimeout(() => terminate.call(this), LATE_MS);
    };
    const OriginalBlob = Blob;
    window.Blob = class extends OriginalBlob {
      constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
        const source = parts?.map(String).join("") ?? "";
        const late = `{
          const close = FileSystemSyncAccessHandle.prototype.close;
          FileSystemSyncAccessHandle.prototype.close = function () {
            setTimeout(() => close.call(this), ${LATE_MS});
          };
        }\n`;
        super(
          source.includes("createSyncAccessHandle") ? [late, ...(parts ?? [])] : parts,
          options,
        );
      }
    } as typeof Blob;
  });

  // The first visit creates the database files; the next start is what the iPhone ran into.
  await page.goto("/");
  await expect(page.getByText("0 XP", { exact: true })).toBeVisible({ timeout: 15_000 });
  const relaunched = await page.context().newPage();
  await page.close();
  await relaunched.goto("/");

  await expect(relaunched.getByText("0 XP", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(relaunched.getByText(STUCK)).toHaveCount(0);
  await expectOneDatabaseWorker(relaunched);
});

// Why the page must run ONE SQLite worker: OPFS gives a file a single sync access handle, so a
// second acquisition in the same page (a second SQLite worker, or the file probe older builds
// ran next to it) fails, on WebKit with exactly the iPhone's `InvalidStateError`.
test("a second acquisition of the database files in the same page collides with the first", async ({
  page,
  browserName,
}) => {
  await page.goto("/");
  await expect(page.getByText("0 XP", { exact: true })).toBeVisible();
  await expectOneDatabaseWorker(page);

  const result = await page.evaluate(() => {
    const source = `
      self.onmessage = async () => {
        try {
          const root = await navigator.storage.getDirectory();
          const directory = await root.getDirectoryHandle("expo-sqlite");
          for await (const [, handle] of directory) {
            if (handle.kind === "file") (await handle.createSyncAccessHandle()).close();
          }
          self.postMessage("opened");
        } catch (error) {
          self.postMessage(error.name);
        }
      };`;
    const worker = new Worker(URL.createObjectURL(new Blob([source], { type: "text/javascript" })));
    return new Promise<string>((resolve) => {
      worker.onmessage = ({ data }) => resolve(String(data));
      worker.postMessage("go");
    });
  });

  expect(result).toBe(
    browserName === "webkit" ? "InvalidStateError" : "NoModificationAllowedError",
  );
});

test("Google's /auth/callback completes the sign-in flow without opening the database", async ({
  page,
}) => {
  // Records which page starts a worker: expo-sqlite opens the database in one (through a blob
  // URL wrapper when cross-origin isolated) and the ownership probe uses another. The callback
  // page must start none.
  await page.addInitScript(() => {
    const Original = Worker;
    window.Worker = class extends Original {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        const seen = JSON.parse(localStorage.getItem("e2e.workers") ?? "[]") as string[];
        seen.push(location.pathname);
        localStorage.setItem("e2e.workers", JSON.stringify(seen));
      }
    } as typeof Worker;
  });
  await page.goto("/");
  await expect(page.getByText("0 XP", { exact: true })).toBeVisible();

  // A callback this tab never asked for: stashed, handed to /auth/completar, refused there.
  await page.goto("/auth/callback#id_token=a.b.c&state=forged");
  await expect(page).toHaveURL(/\/auth\/completar$/);
  await expect(page.getByText(/No pudimos verificar este ingreso/)).toBeVisible();

  const workers = await page.evaluate(
    () => JSON.parse(localStorage.getItem("e2e.workers") ?? "[]") as string[],
  );
  expect(workers).toContain("/");
  expect(workers).toContain("/auth/completar");
  expect(workers).not.toContain("/auth/callback");
  // The token is gone from storage too (read once by /auth/completar).
  expect(await page.evaluate(() => localStorage.getItem("english-learn.auth-callback"))).toBeNull();
});

/** Grabs expo-sqlite's files from a worker of `holder` (a non-app page of the origin). */
async function holdDatabaseFiles(holder: Page) {
  await holder.evaluate(async () => {
    const source = `
      self.onmessage = async () => {
        const handles = [];
        for (let attempt = 0; attempt < 50; attempt++) {
          try {
            const root = await navigator.storage.getDirectory();
            const directory = await root.getDirectoryHandle("expo-sqlite");
            for await (const [, handle] of directory) {
              if (handle.kind === "file") handles.push(await handle.createSyncAccessHandle());
            }
            self.__handles = handles;
            self.postMessage("held");
            return;
          } catch (error) {
            for (const handle of handles.splice(0)) handle.close();
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        }
        self.postMessage("failed");
      };`;
    const worker = new Worker(URL.createObjectURL(new Blob([source], { type: "text/javascript" })));
    (window as unknown as { __holder: Worker }).__holder = worker;
    const result = await new Promise((resolve) => {
      worker.onmessage = ({ data }) => resolve(data);
      worker.postMessage("hold");
    });
    if (result !== "held") throw new Error("could not hold the database files");
  });
}
