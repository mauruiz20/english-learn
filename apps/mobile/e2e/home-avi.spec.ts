import { playSessionCorrectly } from "./support/content";
import { expect, test, type Page } from "./support/test";

// Avi beside the home greeting (`docs/design/avi-rewards.md`, section 5): dressed in the
// learner's outfit, saying a line for its state, and the way into the wardrobe. `?today=` is the
// test-only date override (EXPO_PUBLIC_E2E); the system time is pinned to noon so Avi is never
// sleepy for the night.

const hero = (page: Page) => page.getByTestId("home-avi");

test.beforeEach(async ({ page }) => {
  await page.clock.setSystemTime(new Date("2026-11-02T12:00:00"));
});

/** A perfect new lesson from home (the next one on the path), back to home after it. */
async function lessonOn(page: Page, day: string, lesson: string) {
  await page.goto(`/?today=${day}`);
  await page.getByRole("button", { name: lesson, exact: true }).click();
  await playSessionCorrectly(page, "¡Lección completada!");
  await page.getByRole("button", { name: "Volver al inicio", exact: true }).click();
}

/** The pose's transform, sampled every frame for `ms`. */
async function poseSamples(page: Page, ms: number): Promise<string[]> {
  return page.evaluate(
    (duration) =>
      new Promise<string[]>((resolve) => {
        const pose = document.querySelector('[data-testid="home-avi-pose"]')!;
        const samples: string[] = [];
        const start = performance.now();
        const sample = () => {
          samples.push(getComputedStyle(pose).transform);
          if (performance.now() - start < duration) requestAnimationFrame(sample);
          else resolve(samples);
        };
        requestAnimationFrame(sample);
      }),
    ms,
  );
}

test.describe("Avi on home", () => {
  test("greets a fresh learner, celebrates a lesson, then rests, welcomes back and misses", async ({
    page,
  }) => {
    await page.goto("/?today=2026-11-02");
    await expect(page.getByText("¡Hola! Soy Avi. ¿Empezamos?")).toBeVisible();
    await expect(hero(page)).toHaveAccessibleName("Avi, contento. Abre el armario");

    await page.getByRole("button", { name: "Mi rutina diaria", exact: true }).click();
    await playSessionCorrectly(page, "¡Lección completada!");
    await page.getByRole("button", { name: "Volver al inicio", exact: true }).click();
    await expect(page.getByText("¡Lo lograste!")).toBeVisible();
    await expect(hero(page)).toHaveAccessibleName("Avi, celebrando. Abre el armario");

    // A reload starts a new app session: nothing to celebrate, today's study is done.
    await page.reload();
    await expect(page.getByText("Todo listo por hoy.")).toBeVisible();

    await page.goto("/?today=2026-11-03");
    await expect(page.getByText("¡Qué bueno verte!")).toBeVisible();

    // Days away break the streak: Avi missed the learner, never naming what was lost.
    await page.goto("/?today=2026-11-10");
    await expect(page.getByText("Te extrañé. Hoy empezamos una racha nueva.")).toBeVisible();
    await expect(hero(page)).toHaveAccessibleName("Avi, con ganas de verte. Abre el armario");
  });

  test("wears the learner's outfit and opens the wardrobe when tapped", async ({ page }) => {
    await lessonOn(page, "2026-11-02", "Mi rutina diaria");
    await lessonOn(page, "2026-11-03", "Mi casa");
    await expect(page.getByLabel("Tienes 40 plumas")).toBeVisible();

    await hero(page).click();
    await expect(page).toHaveURL(/\/armario$/);
    await page.getByRole("tab", { name: "Stickers" }).click();
    await page.getByRole("button", { name: "Estrella, 40 plumas", exact: true }).click();
    await page.getByRole("button", { name: "Comprar por 40 plumas", exact: true }).click();
    await page.getByRole("button", { name: "Comprar", exact: true }).click();
    await page.getByRole("button", { name: "Ponérselo", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Estrella, 40 plumas, comprado, puesto", exact: true }),
    ).toBeVisible();

    await page.getByRole("button", { name: /^Volver/ }).click();
    await expect(page.getByText("¿Cómo me veo?")).toBeVisible();
    await expect(hero(page)).toHaveAccessibleName(
      "Avi, estrenando ropa, con sticker de estrella. Abre el armario",
    );
    await expect(hero(page).getByTestId("avi-item-estrella")).toBeVisible();

    await page.reload();
    await expect(hero(page).getByTestId("avi-item-estrella")).toBeVisible();
    await hero(page).click();
    await expect(page.getByRole("heading", { name: "El armario de Avi" })).toBeVisible();
  });

  test("hovers and blinks with motion, and keeps still with reduced motion", async ({ page }) => {
    await page.goto("/?today=2026-11-02");
    await expect(page.getByText("¡Hola! Soy Avi. ¿Empezamos?")).toBeVisible();
    const moving = await poseSamples(page, 1600);
    expect(new Set(moving).size).toBeGreaterThan(1);
    // A blink shuts the eyes for only 150 ms: watch the DOM for it rather than polling.
    const blinked = await page.evaluate(
      () =>
        new Promise<boolean>((resolve) => {
          const avi = document.querySelector('[data-testid="home-avi"]')!;
          const shut = () => avi.querySelector('[data-testid="avi-eyes-closed"]') !== null;
          const observer = new MutationObserver(() => {
            if (!shut()) return;
            observer.disconnect();
            resolve(true);
          });
          observer.observe(avi, { childList: true, subtree: true, attributes: true });
          setTimeout(() => {
            observer.disconnect();
            resolve(shut());
          }, 6000);
        }),
    );
    expect(blinked).toBe(true);

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    await expect(page.getByText("¡Hola! Soy Avi. ¿Empezamos?")).toBeVisible();
    const still = await poseSamples(page, 1600);
    expect(new Set(still).size).toBe(1);
    await page.waitForTimeout(4500);
    await expect(hero(page).getByTestId("avi-eyes-closed")).toHaveCount(0);
    await expect(hero(page).getByTestId("avi-eyes-open")).toHaveCount(1);
  });
});
