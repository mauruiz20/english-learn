import { test as ephemeral } from "@playwright/test";
import { expect, test } from "./support/test";

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

// Files held without the owner lock or any answer (what iOS showed): never "otra pestaña". The
// app opens normally and, when the open really fails, explains how to free the data.
test("files held by something that is not a tab never claim 'open in another tab'", async ({
  page,
  context,
}) => {
  test.setTimeout(60_000);
  await page.goto("/");
  await expect(page.getByText("0 XP", { exact: true })).toBeVisible();
  // A non-app page of the origin grabs expo-sqlite's files from a worker, then the app closes.
  const holder = await context.newPage();
  await holder.goto("/metadata.json");
  await page.close();
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

  const app = await context.newPage();
  await app.goto("/");
  await expect(app.getByRole("heading")).toHaveText(STUCK, { timeout: 30_000 });
  await expect(app.getByText(OPEN_ELSEWHERE)).toHaveCount(0);
  await app.getByRole("button", { name: "Detalles técnicos", exact: true }).click();
  await expect(app.getByText(/^Motivo: open-failed:/)).toBeVisible();
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
