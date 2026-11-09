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
const TOMORROW = "2030-01-03";
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

function uploadedReviewExercises(account: FakeAccount): number {
  const uploaded = new Map<string, number>();
  for (const event of account.syncs.flatMap((sync) => sync.events)) {
    if (
      event.type !== "session_completed" ||
      typeof event.payload !== "object" ||
      event.payload === null
    ) {
      continue;
    }
    const payload = event.payload as { sessionId?: unknown; kind?: unknown; exercises?: unknown };
    if (
      typeof payload.sessionId === "string" &&
      payload.kind === "review" &&
      typeof payload.exercises === "number"
    ) {
      uploaded.set(payload.sessionId, payload.exercises);
    }
  }
  return [...uploaded.values()].reduce((sum, exercises) => sum + exercises, 0);
}

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
  const firstServed = await playSessionCorrectly(page, "¡Repaso completado!");
  expect(firstServed).toBe(first.next);
  await expect(
    page.getByText(new RegExp(`Te quedan ${first.later} para repasar hoy`)),
  ).toBeVisible();
  await page.getByRole("button", { name: "Volver al inicio", exact: true }).click();

  // Home drops by exactly what the review served.
  await expect.poll(async () => total(await homeCount(page))).toBe(first.later);
  const second = await homeCount(page);
  expect(second.next).toBe(first.later);
  expect(second.later).toBe(0);
  await expect.poll(() => account.storedTypes()).toContain("session_completed");

  // Saved: the same count after a reload (and the sync pull that comes with it).
  await page.reload();
  expect(await homeCount(page)).toEqual(second);

  // The remaining allowance serves four more exercises, completing today's limit.
  await page.getByRole("button", { name: "Repasar", exact: true }).click();
  await expect(page.getByText(`Ejercicio 1 de ${second.next}`, { exact: true })).toBeVisible();
  const secondServed = await playSessionCorrectly(page, "¡Repaso completado!");
  expect(firstServed + secondServed).toBe(20);
  await expect(page.getByText(/El resto queda para mañana\./).last()).toBeVisible();
  await expect.poll(() => uploadedReviewExercises(account)).toBe(20);
  await page.getByRole("button", { name: "Volver al inicio", exact: true }).click();
  await page.goto(`/?today=${TODAY}`);
  await expect(page.getByText("El resto queda para mañana.").last()).toBeVisible();

  // Reload and opening /review directly cannot spend a fresh same-day allowance.
  await page.reload();
  await expect(page.getByText("El resto queda para mañana.").last()).toBeVisible();
  await expect(page.getByRole("button", { name: "Repasar", exact: true })).toHaveCount(0);
  await page.goto(`/review?today=${TODAY}`);
  await expect(
    page.getByText("Ya repasaste tus 20 ejercicios de hoy. El resto queda para mañana."),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Ya repasaste tus 20 ejercicios de hoy. El resto queda para mañana."),
  ).toBeVisible();

  // The date-scoped allowance resets tomorrow, while the unreviewed backlog remains due.
  await page.goto(`/?today=${TOMORROW}`);
  const nextDay = await homeCount(page);
  expect(nextDay.next).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Repasar", exact: true }).click();
  await expect(page.getByText(`Ejercicio 1 de ${nextDay.next}`, { exact: true })).toBeVisible();
});
