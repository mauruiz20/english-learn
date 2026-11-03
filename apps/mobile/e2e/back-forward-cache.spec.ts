import { databaseFilesState, simulateBackForwardCache } from "./support/back-forward-cache";
import { FakeAccount } from "./support/fake-account";
import { expect, expectOneDatabaseWorker, test as base, type Page } from "./support/test";

// iOS kept the page that redirected to Google frozen in its back/forward cache, with expo-sqlite's
// worker still holding the database files: after signing in again, every page of the app showed
// "No pudimos abrir tus datos en esta ventana." (`open-failed:InvalidStateError`) until a reboot.
// `simulateBackForwardCache` keeps an armed page frozen the same way (see there). The page must
// let go of the files before it leaves, and on `pagehide`.

const test = base.extend<{ account: FakeAccount }>({
  account: async ({ context }, provide) => {
    const account = new FakeAccount();
    await account.install(context);
    await provide(account);
    await account.close();
  },
});

const STUCK = "No pudimos abrir tus datos en esta ventana.";

async function openCuenta(page: Page) {
  await page.getByRole("link", { name: "Cuenta", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Continuar con Google|Cerrar sesión/ }).first(),
  ).toBeVisible();
}

async function expectGreeting(page: Page, account: FakeAccount) {
  await expect(page.getByRole("heading", { name: `Hola, ${account.givenName}` })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText(STUCK)).toHaveCount(0);
}

test("sign-out, then sign-in through Google while the page that left stays frozen, then a cold relaunch", async ({
  page,
  context,
  account,
}) => {
  test.setTimeout(120_000);
  const cache = await simulateBackForwardCache(context);
  await page.goto("/");
  await expect(page.getByText("0 XP", { exact: true })).toBeVisible();

  // First sign-in: the page with the database open leaves for Google and stays frozen.
  await openCuenta(page);
  await cache.arm(page);
  await page.getByRole("button", { name: "Continuar con Google", exact: true }).click();
  const signedIn = await cache.next();
  await expectGreeting(signedIn, account);

  // Sign out, then sign in again (what the owner did): another frozen page.
  await openCuenta(signedIn);
  await signedIn.getByRole("button", { name: "Cerrar sesión", exact: true }).click();
  await signedIn.getByRole("button", { name: "Cerrar sesión ahora", exact: true }).click();
  await expect(
    signedIn.getByRole("button", { name: "Continuar con Google", exact: true }),
  ).toBeVisible();
  await cache.arm(signedIn);
  await signedIn.getByRole("button", { name: "Continuar con Google", exact: true }).click();
  const again = await cache.next();
  await expectGreeting(again, account);
  await expectOneDatabaseWorker(again);

  // Cold relaunch: the app is closed; the frozen pages stay (iOS keeps them) and hold nothing.
  await again.close();
  const probe = await context.newPage();
  await probe.goto("/metadata.json");
  expect(await databaseFilesState(probe)).toBe("free");
  const relaunched = await context.newPage();
  await relaunched.goto("/");
  await expectGreeting(relaunched, account);
  await expectOneDatabaseWorker(relaunched);
});

// The harness itself: a frozen page that let go of nothing keeps the files held (the iPhone's
// state); `pagehide` alone, without the app's own release before leaving, frees them.
test.describe("a page frozen in the back/forward cache", () => {
  for (const pagehide of [false, true]) {
    test(`navigating away ${pagehide ? "with" : "without"} pagehide ${pagehide ? "frees" : "keeps"} the files`, async ({
      page,
      context,
    }) => {
      const cache = await simulateBackForwardCache(context);
      await page.goto("/");
      await expect(page.getByText("0 XP", { exact: true })).toBeVisible();
      await cache.arm(page, { pagehide });
      // Not the app's own navigation (a link, the browser): only `pagehide` can release.
      await page.evaluate(() => location.assign("/metadata.json"));
      const probe = await cache.next();

      const state = await databaseFilesState(probe, pagehide ? 5_000 : 1_000);
      // Held: WebKit `InvalidStateError`, Chromium `NoModificationAllowedError`.
      expect(state).toMatch(
        pagehide ? /^free$/ : /^(InvalidStateError|NoModificationAllowedError)$/,
      );
    });
  }

  test("the app's own navigation frees the files before leaving, even without pagehide", async ({
    page,
    context,
    account,
  }) => {
    const cache = await simulateBackForwardCache(context);
    await page.goto("/");
    await expect(page.getByText("0 XP", { exact: true })).toBeVisible();
    await openCuenta(page);
    await cache.arm(page, { pagehide: false });
    await page.getByRole("button", { name: "Continuar con Google", exact: true }).click();
    const signedIn = await cache.next();

    await expectGreeting(signedIn, account);
  });
});
