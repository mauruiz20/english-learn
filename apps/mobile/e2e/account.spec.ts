import { playSessionCorrectly } from "./support/content";
import { FakeAccount } from "./support/fake-account";
import { clearOriginData, expect, test as base, type Page } from "./support/test";

/** Each test gets its own fake Google + API server, wired into the browser context. */
const test = base.extend<{ account: FakeAccount }>({
  account: async ({ context }, provide) => {
    const account = new FakeAccount();
    await account.install(context);
    await provide(account);
    await account.close();
  },
});

// Optional Google account and progress sync on the web. Google and the API are faked by a local
// server (`FakeAccount`); the app runs as built, on localhost (where accounts are
// offered like on english.maumar.com.ar). A "second device" is the same browser after its
// origin data (OPFS database, service worker) was wiped: a fresh install.

async function playFirstLesson(page: Page) {
  await page.getByRole("button", { name: "Mi rutina diaria", exact: true }).click();
  await playSessionCorrectly(page, "¡Lección completada!");
  await page.getByRole("button", { name: "Volver al inicio", exact: true }).click();
  await expect(page.getByText("80 XP", { exact: true })).toBeVisible();
}

async function signIn(page: Page, account: FakeAccount) {
  await page.getByRole("link", { name: "Cuenta", exact: true }).click();
  await page.getByRole("button", { name: "Continuar con Google", exact: true }).click();
  await expect(page.getByText(account.email)).toBeVisible();
  await expect(page.getByText("Sincronizado hace un momento")).toBeVisible();
}

async function goHome(page: Page) {
  await page.goto("/");
  await expect(page.getByLabel(/^Racha: /)).toBeVisible();
}

test.describe("account and sync", () => {
  test("signs in with Google, uploads the local history, and another device receives it", async ({
    page,
    account,
  }) => {
    await page.goto("/");
    await playFirstLesson(page);
    await signIn(page, account);
    expect(account.cookieTransport).toBe(true);

    // The redirect carried a fresh state and nonce; the API got the same nonce back.
    const google = account.googleRequests[0]!;
    expect(google.get("response_type")).toBe("id_token");
    expect(google.get("redirect_uri")).toBe(`${new URL(page.url()).origin}/auth/callback`);
    expect(account.signIns[0]?.nonce).toBe(google.get("nonce"));
    // The token never stays in the address bar or the history entry.
    expect(page.url()).not.toContain("id_token");
    expect(new URL(page.url()).pathname).toBe("/cuenta");

    // The first sync uploads the whole local history.
    const first = account.syncs[0]!;
    expect(first.cursor).toBeNull();
    expect(first.events.map((e) => e.type)).toEqual(
      expect.arrayContaining(["item_reviewed", "session_completed"]),
    );
    expect(first.events.every((e) => !("deviceId" in e))).toBe(true);
    expect(account.storedTypes()).toContain("session_completed");

    // A second device: a fresh install, signed out, with no progress.
    await clearOriginData(page);
    await goHome(page);
    await expect(page.getByText("0 XP", { exact: true })).toBeVisible();
    await signIn(page, account);
    const second = account.syncs.at(-1)!;
    expect(second.deviceId).not.toBe(first.deviceId);

    await goHome(page);
    await expect(page.getByText("80 XP", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Racha: 1 día")).toBeVisible();
    await expect(page.getByRole("button", { name: "Mi rutina diaria, completada" })).toBeVisible();
  });

  test("signing out keeps this device's progress by default, or deletes it", async ({
    page,
    account,
  }) => {
    await page.goto("/");
    await playFirstLesson(page);
    await signIn(page, account);

    await page.getByRole("button", { name: "Cerrar sesión", exact: true }).click();
    await page.getByRole("button", { name: "Cerrar sesión ahora", exact: true }).click();
    await expect(page.getByRole("button", { name: "Continuar con Google" })).toBeVisible();
    await goHome(page);
    await expect(page.getByText("80 XP", { exact: true })).toBeVisible();

    await signIn(page, account);
    await page.getByRole("button", { name: "Cerrar sesión", exact: true }).click();
    await page.getByRole("radio", { name: /Borrarlo de este dispositivo/ }).click();
    await page.getByRole("button", { name: "Cerrar sesión ahora", exact: true }).click();
    await expect(page.getByRole("button", { name: "Continuar con Google" })).toBeVisible();
    await goHome(page);
    await expect(page.getByText("0 XP", { exact: true })).toBeVisible();

    // Still signed out after a reload: the session was revoked.
    await page.reload();
    await page.getByRole("link", { name: "Cuenta", exact: true }).click();
    await expect(page.getByRole("button", { name: "Continuar con Google" })).toBeVisible();
  });

  test("restores the session after a reload and syncs a session finished offline once back online", async ({
    page,
    context,
    account,
  }) => {
    await page.goto("/");
    await signIn(page, account);

    // The marker survives a reload; the refresh cookie gives a new access token.
    await page.reload();
    await expect(page.getByText(account.email)).toBeVisible();

    await goHome(page);
    await context.setOffline(true);
    await playFirstLesson(page);
    await page.getByRole("link", { name: "Cuenta", exact: true }).click();
    await expect(page.getByText("Sin conexión, se sincroniza al volver")).toBeVisible();
    expect(account.storedTypes()).not.toContain("session_completed");

    await context.setOffline(false);
    await expect.poll(() => account.storedTypes()).toContain("session_completed");
    await expect(page.getByText("Sincronizado hace un momento")).toBeVisible();
  });
});
