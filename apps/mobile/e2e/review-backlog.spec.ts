import { playSessionCorrectly, reviewableItemIds } from "./support/content";
import { FakeAccount } from "./support/fake-account";
import { expect, test as base, type Page } from "./support/test";

// More items due than one daily review holds (the owner's report: after a review home still
// said "20 pendientes" and it looked unsaved). Home's count is exactly what the next review
// serves, it says how many wait after it, and each review takes its share off for good (also
// after a reload, with sync on). The backlog comes from another device of the account, through
// the fake API. `?today=` is a test-only clock override (EXPO_PUBLIC_E2E).

const test = base.extend<{ account: FakeAccount }>({
  account: async ({ context }, provide) => {
    const account = new FakeAccount();
    await account.install(context);
    await provide(account);
    await account.close();
  },
});

const DUE = "2030-01-01";
const TODAY = "2030-01-02";
const BACKLOG = 45;

/** Another device's pre-event progress: `BACKLOG` items learned, all due on `DUE`. */
function backlogBaseline() {
  return {
    id: "019a0000-0000-7000-8000-000000000001",
    type: "baseline_imported",
    localDate: "2029-12-31",
    occurredAt: Date.UTC(2029, 11, 31, 9),
    payload: {
      v: 1,
      states: reviewableItemIds(BACKLOG).map((itemId) => ({
        itemId,
        ease: 2.5,
        intervalDays: 1,
        reps: 1,
        lapses: 0,
        dueDate: DUE,
      })),
      xp: 0,
      streak: { current: 0, longest: 0, lastActiveDate: null },
      placement: null,
    },
  };
}

/** Home's review note: the next review's size and what waits after it (0 when nothing). */
async function homeCount(page: Page): Promise<{ next: number; later: number }> {
  const pending = page.getByText(/^\d+ pendientes?$/);
  await expect(pending).toBeVisible();
  const next = Number((await pending.textContent())?.match(/\d+/)?.[0]);
  const laterNote = page.getByText(/^y \d+ más después$/);
  const later = (await laterNote.isVisible())
    ? Number((await laterNote.textContent())?.match(/\d+/)?.[0])
    : 0;
  return { next, later };
}

const total = ({ next, later }: { next: number; later: number }) => next + later;

test("a backlog bigger than one review: home counts what each review serves and it stays saved", async ({
  page,
  account,
}) => {
  test.setTimeout(120_000);
  account.seed("019a0000-0000-7000-8000-0000000000aa", [backlogBaseline()]);

  await page.goto("/");
  await page.getByRole("link", { name: "Cuenta", exact: true }).click();
  await page.getByRole("button", { name: "Continuar con Google", exact: true }).click();
  await expect(page.getByRole("heading", { name: `Hola, ${account.givenName}` })).toBeVisible();

  await page.goto(`/?today=${TODAY}`);
  await expect(page.getByText(/^y \d+ más después$/)).toBeVisible();
  const first = await homeCount(page);
  expect(first.next).toBeGreaterThan(0);
  expect(first.next).toBeLessThanOrEqual(20);
  expect(first.later).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Repasar", exact: true }).click();
  await expect(page.getByText(`Ejercicio 1 de ${first.next}`, { exact: true })).toBeVisible();
  expect(await playSessionCorrectly(page, "¡Repaso completado!")).toBe(first.next);
  await expect(
    page.getByText(
      first.later === 1
        ? "Te queda 1 para otro repaso."
        : `Te quedan ${first.later} para otro repaso.`,
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Volver al inicio", exact: true }).click();

  // Home drops by exactly what the review served.
  await expect.poll(async () => total(await homeCount(page))).toBe(first.later);
  const second = await homeCount(page);
  await expect.poll(() => account.storedTypes()).toContain("session_completed");

  // Saved: the same count after a reload (and the sync pull that comes with it).
  await page.reload();
  expect(await homeCount(page)).toEqual(second);

  // The next review serves the next items, and the count keeps going down.
  await page.getByRole("button", { name: "Repasar", exact: true }).click();
  await expect(page.getByText(`Ejercicio 1 de ${second.next}`, { exact: true })).toBeVisible();
  await playSessionCorrectly(page, "¡Repaso completado!");
  await page.getByRole("button", { name: "Volver al inicio", exact: true }).click();
  if (second.later === 0) {
    await expect(page.getByText("Nada para repasar hoy")).toBeVisible();
  } else {
    await expect.poll(async () => total(await homeCount(page))).toBe(second.later);
  }
});
