import { playSessionCorrectly } from "./support/content";
import { FakeTransfers } from "./support/fake-transfers";
import {
  clearOriginData,
  expect,
  test as base,
  waitForServiceWorker,
  type Page,
} from "./support/test";

// The app moved from its old web address to a new one; each address keeps its own on-device
// database, and a one-time transfer through the API carries the progress over. Two servers of the
// same e2e export play the two addresses (two ports: two origins) and a local fake stands in for
// the transfer API.
const NEW = `http://localhost:${process.env.E2E_PORT ?? 4173}`;
const OLD = `http://localhost:${process.env.E2E_OLD_PORT ?? Number(process.env.E2E_PORT ?? 4173) + 1}`;

const test = base.extend<{ transfers: FakeTransfers }>({
  transfers: async ({ context, page }, provide) => {
    // The fixture `page` already emptied the new address; start the old one empty too (WebKit
    // shares website data between persistent profiles).
    await clearOriginData(page, OLD);
    const transfers = new FakeTransfers();
    await transfers.install(context, { newWebOrigin: NEW });
    await provide(transfers);
    await transfers.close();
  },
});

/**
 * The old address as learners had it before the move was announced: the app as usual. The
 * old-address setting is stored only now (on that origin), like the deploy that announced it.
 */
async function announceTheMove(page: Page) {
  await page.evaluate((old) => localStorage.setItem("english-learn.e2e.oldWebOrigin", old), OLD);
}

async function playFirstLesson(page: Page) {
  await page.getByRole("button", { name: "Mi rutina diaria", exact: true }).click();
  await playSessionCorrectly(page, "¡Lección completada!");
  await page.getByRole("button", { name: "Volver al inicio", exact: true }).click();
  await expect(page.getByText("80 XP", { exact: true })).toBeVisible();
}

test.describe("progress transfer to the new web address", () => {
  test("takes the old address's progress along in one click, then the old address redirects", async ({
    page,
    transfers,
  }) => {
    await page.goto(`${OLD}/`);
    await waitForServiceWorker(page);
    await playFirstLesson(page);

    await announceTheMove(page);
    await page.reload();
    await expect(page.getByText(/^La app se mudó a localhost:\d+$/)).toBeVisible();
    await page.getByRole("button", { name: "Llevar mi progreso", exact: true }).click();

    // On the new address, the token left the address bar before anything else, and the claimed
    // progress waits for the learner's confirmation.
    await expect(page.getByText("Progreso del sitio anterior")).toBeVisible();
    expect(page.url()).toBe(`${NEW}/importar`);
    expect(await page.evaluate(() => history.length > 0 && location.hash)).toBe("");
    await expect(page.getByText("80 XP", { exact: true })).toBeVisible();
    await expect(page.getByText(/^Lecciones completadas: [1-9]\d*$/)).toBeVisible();
    await expect(page.getByText("¿Importarlo a este dispositivo?")).toBeVisible();
    expect(transfers.created).toHaveLength(1);
    expect(transfers.created[0]!.map((e) => e.type)).toContain("session_completed");
    expect(transfers.claims).toEqual([{ token: expect.any(String), ok: true }]);
    expect(transfers.origins).toEqual([OLD, NEW]);

    await page.getByRole("button", { name: "Importar", exact: true }).click();
    await expect(page.getByText("¡Tu progreso llegó!")).toBeVisible();
    await expect(page.getByText("80 XP", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Ir al inicio", exact: true }).click();
    await page.waitForURL(`${NEW}/`);
    await expect(page.getByLabel(/^Racha: /)).toBeVisible();
    await expect(page.getByText("80 XP", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel(/^Racha: /)).toBeVisible();
    await expect(page.getByText("80 XP", { exact: true })).toBeVisible();

    // Back on the old address: straight to the same page on the new one.
    await page.goto(`${OLD}/album`);
    await page.waitForURL(`${NEW}/album`);
    await expect(page.getByText(/insignias/).first()).toBeVisible();
  });

  test("an old address without progress sends the learner to the new one at once", async ({
    page,
    transfers,
  }) => {
    await page.goto(`${OLD}/metadata.json`);
    await announceTheMove(page);

    await page.goto(`${OLD}/about`);

    await page.waitForURL(`${NEW}/about`);
    expect(transfers.created).toEqual([]);
  });

  test("a declined import saves nothing on the new address", async ({ page, transfers }) => {
    await page.goto(`${OLD}/`);
    await waitForServiceWorker(page);
    await playFirstLesson(page);
    await announceTheMove(page);
    await page.reload();
    await page.getByRole("button", { name: "Llevar mi progreso", exact: true }).click();

    await page.getByRole("button", { name: "Cancelar", exact: true }).click();

    await expect(page.getByText(/No importamos nada/)).toBeVisible();
    expect(transfers.claims).toEqual([{ token: expect.any(String), ok: true }]);
    await page.getByRole("button", { name: "Ir al inicio", exact: true }).click();
    await page.waitForURL(`${NEW}/`);
    await expect(page.getByRole("button", { name: "Mi rutina diaria", exact: true })).toBeVisible();
    await expect(page.getByText("80 XP", { exact: true })).toHaveCount(0);
  });

  test("the old address never bounces a transfer token to the new one", async ({
    page,
    transfers,
  }) => {
    await page.goto(`${OLD}/metadata.json`);
    await announceTheMove(page);

    await page.goto(`${OLD}/importar#t=attacker-token`);

    await page.waitForURL(`${NEW}/importar`);
    await expect(page.getByRole("alert")).toContainText("no trae progreso");
    expect(transfers.claims).toEqual([]);
  });

  test("a used link explains itself and points back to the old address", async ({
    page,
    transfers,
  }) => {
    await page.goto(`${NEW}/importar#t=never-issued`);

    await expect(page.getByRole("alert")).toContainText("ya se usó o venció");
    expect(page.url()).toBe(`${NEW}/importar`);
    expect(transfers.claims).toEqual([{ token: "never-issued", ok: false }]);
    await expect(page.getByRole("button", { name: "Volver al sitio anterior" })).toBeVisible();
  });
});
