import { playSessionCorrectly } from "./support/content";
import { FakeAccount } from "./support/fake-account";
import { clearOriginData, expect, test as base, type Page } from "./support/test";

// Avi's wardrobe (`/armario`): plumas earned by studying buy items for Avi, who then wears them
// everywhere. Purchases and changes of clothes are progress events: they survive a reload and
// sync to the learner's other devices. `?today=` is a test-only clock override (EXPO_PUBLIC_E2E).

const test = base.extend<{ account: FakeAccount }>({
  account: async ({ context }, provide) => {
    const account = new FakeAccount();
    await account.install(context);
    await provide(account);
    await account.close();
  },
});

/** A perfect new lesson on a new study day: 5 (study day) + 5 (new lesson) + 10 (perfect). */
async function perfectLessonOn(page: Page, day: string, lesson: string) {
  await page.goto(`/?today=${day}`);
  await page.getByRole("button", { name: lesson, exact: true }).click();
  await playSessionCorrectly(page, "¡Lección completada!");
  await expect(page.getByTestId("summary-plumas").getByText("Plumas: +20")).toBeVisible();
  await page.getByRole("button", { name: "Volver al inicio", exact: true }).click();
  // Home is back before the next `goto`: a navigation still under way could abort it and keep
  // the old page (and its `?today=` date).
  await expect(page.getByTestId("home-avi")).toBeVisible();
}

/** Two study days: 40 plumas, the price of a sticker. */
async function earnFortyPlumas(page: Page) {
  await perfectLessonOn(page, "2026-11-02", "Mi rutina diaria");
  await perfectLessonOn(page, "2026-11-03", "Mi casa");
  await expect(page.getByLabel("Tienes 40 plumas")).toBeVisible();
}

/** From home's balance into the wardrobe; buys the star sticker and puts it on Avi. */
async function buyAndWearStar(page: Page) {
  await page.getByRole("button", { name: "Tienes 40 plumas" }).click();
  await expect(page.getByRole("heading", { name: "El armario de Avi" })).toBeVisible();
  await page.getByRole("tab", { name: "Stickers" }).click();
  await page.getByRole("button", { name: "Estrella, 40 plumas", exact: true }).click();
  await page.getByRole("button", { name: "Comprar por 40 plumas", exact: true }).click();
  await expect(page.getByText("¿Comprar la estrella por 40 plumas?")).toBeVisible();
  await page.getByRole("button", { name: "Comprar", exact: true }).click();
  await expect(page.getByText("¡Listo! Avi ya tiene su estrella.")).toBeVisible();
  await page.getByRole("button", { name: "Ponérselo", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Estrella, 40 plumas, comprado, puesto", exact: true }),
  ).toBeVisible();
}

const guideWears = (page: Page, itemId: string) =>
  page.getByTestId("avi-guide").getByTestId(`avi-item-${itemId}`);

/** The vertical offset of the try-on stage, sampled every frame for `ms` after `click`. */
async function stageOffsetsWhile(page: Page, click: () => Promise<void>, ms = 400) {
  await page.evaluate((duration) => {
    const stage = document.querySelector('[data-testid="armario-stage"]')!;
    const samples: number[] = [];
    (window as unknown as { __stageSamples: number[] }).__stageSamples = samples;
    const start = performance.now();
    const sample = () => {
      const transform = getComputedStyle(stage).transform;
      samples.push(transform === "none" ? 0 : Math.abs(new DOMMatrixReadOnly(transform).m42));
      if (performance.now() - start < duration) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }, ms);
  await click();
  await page.waitForTimeout(ms + 100);
  return page.evaluate(() => (window as unknown as { __stageSamples: number[] }).__stageSamples);
}

test.describe("Avi's wardrobe", () => {
  test("earns plumas, tries on, buys and wears a sticker, and Avi keeps it after a reload", async ({
    page,
  }) => {
    const problems: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") problems.push(message.text());
    });
    page.on("pageerror", (error) => problems.push(error.message));

    await earnFortyPlumas(page);
    await page.getByRole("button", { name: "Tienes 40 plumas" }).click();
    await expect(page).toHaveURL(/\/armario$/);
    await expect(page.getByTestId("armario-plumas")).toHaveAccessibleName("Tienes 40 plumas");

    // Trying on is free: Avi wears it, and nothing is bought.
    await page.getByRole("tab", { name: "Cuello" }).click();
    await page.getByRole("button", { name: "Pañuelo, 60 plumas", exact: true }).click();
    await expect(page.getByTestId("armario-avi").getByTestId("avi-item-panuelo")).toBeVisible();
    await expect(page.getByText("Te faltan 20 plumas")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Comprar por 60 plumas", exact: true }),
    ).toHaveCount(0);

    await page.goto("/");
    await buyAndWearStar(page);
    await expect(page.getByLabel("Tienes 0 plumas")).toBeVisible();

    await page.getByRole("button", { name: /^Volver/ }).click();
    await expect(page.getByLabel("Tienes 0 plumas")).toBeVisible();
    await expect(guideWears(page, "estrella")).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Tienes 0 plumas")).toBeVisible();
    await expect(guideWears(page, "estrella")).toBeVisible();
    // It lives in the event log: a cache rebuilt from the log still has it.
    await page.goto("/?rebuildProgress=1");
    await expect(guideWears(page, "estrella")).toBeVisible();

    expect(problems).toEqual([]);
  });

  test("another device signed in to the same account sees Avi's outfit", async ({
    page,
    account,
  }) => {
    await earnFortyPlumas(page);
    await buyAndWearStar(page);

    await page.goto("/");
    await page.getByRole("link", { name: "Cuenta", exact: true }).click();
    await page.getByRole("button", { name: "Continuar con Google", exact: true }).click();
    await expect(page.getByRole("heading", { name: `Hola, ${account.givenName}` })).toBeVisible();
    await expect.poll(() => account.storedTypes()).toContain("item_equipped");
    expect(account.storedTypes()).toContain("item_purchased");

    // A second device: a fresh install, signed in to the same account.
    await clearOriginData(page);
    await page.goto("/");
    await expect(page.getByLabel("Tienes 0 plumas")).toBeVisible();
    await expect(guideWears(page, "estrella")).toHaveCount(0);
    await page.getByRole("link", { name: "Cuenta", exact: true }).click();
    await page.getByRole("button", { name: "Continuar con Google", exact: true }).click();
    await expect(page.getByRole("heading", { name: `Hola, ${account.givenName}` })).toBeVisible();

    await expect(guideWears(page, "estrella")).toBeVisible();
    await page.getByRole("button", { name: "Tienes 0 plumas" }).click();
    await page.getByRole("tab", { name: "Stickers" }).click();
    await expect(
      page.getByRole("button", { name: "Estrella, 40 plumas, comprado, puesto", exact: true }),
    ).toBeVisible();
  });

  test("respects reduced motion: trying on shows the item at once, without the hop", async ({
    page,
  }) => {
    await page.goto("/armario");
    await page.getByRole("tab", { name: "Gorros" }).click();
    const moving = await stageOffsetsWhile(page, () =>
      page.getByRole("button", { name: "Gorra, 80 plumas", exact: true }).click(),
    );
    // With motion, the item lands with a small hop.
    expect(Math.max(...moving)).toBeGreaterThan(1);

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    await page.getByRole("tab", { name: "Gafas" }).click();
    const still = await stageOffsetsWhile(page, () =>
      page.getByRole("button", { name: "Gafas de sol, 120 plumas", exact: true }).click(),
    );
    expect(Math.max(...still)).toBe(0);
    await expect(
      page.getByTestId("armario-avi").getByTestId("avi-item-gafas-de-sol"),
    ).toBeVisible();
  });
});
