import { expect, test } from "./support/test";

test("the phrasal reference is reachable from home and works offline without earning XP", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Referencia: phrasal verbs por tema", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Phrasal verbs", exact: true })).toBeVisible();
  await expect(page.getByText("110 entradas · 20 temas", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Casa y rutina", exact: true })).toBeVisible();
  await expect(page.getByText("clean (something) up", { exact: true })).toBeVisible();
  await expect(page.getByText("ordenar, limpiar", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Please clean up your room before dinner.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Por favor, ordena tu cuarto antes de la cena.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Viajes", exact: true })).toBeAttached();
  await expect(page.getByRole("button", { name: "Casa y rutina", exact: true })).toHaveCount(0);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Casa y rutina", exact: true })).toBeVisible();
  await expect(
    page.getByText("Please clean up your room before dinner.", { exact: true }),
  ).toBeVisible();
  const search = page.getByLabel("Buscar phrasal verbs", { exact: true });
  await search.fill("CLEAN UP");
  await expect(page.getByText("clean (something) up", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Viajes", exact: true })).toHaveCount(0);
  await search.fill("limpiar");
  await expect(page.getByText("clean (something) up", { exact: true })).toBeVisible();
  await search.fill("zz-no-match-zz");
  await expect(
    page.getByText("No encontramos phrasal verbs con esa búsqueda.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Limpiar búsqueda", exact: true }).click();
  await expect(page.getByText("110 entradas · 20 temas", { exact: true })).toBeVisible();
  await context.setOffline(false);
  await page.goto("/");
  await expect(page.getByText("0 XP", { exact: true })).toBeVisible();
  await expect(page.getByText("Nada para repasar hoy", { exact: true })).toBeVisible();
});
