import { ApiError, type TransferredEvent } from "@english-learn/api-client";
import { createCorpus } from "@english-learn/content";
import { foldEvents, localDate, type StoredEvent } from "@english-learn/domain";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { AccountContext, type AccountContextValue } from "@/features/account/account-context";
import { allExercises, lesson, passage } from "@/features/lesson/model/fixtures";
import { AppServicesProvider } from "@/infrastructure/services/app-services";
import { createChangeSignal } from "@/infrastructure/sync/sync-triggers";
import { createFakeRepository } from "@/testing/fake-progress-repository";
import { createFakeSettingsRepository } from "@/testing/fake-settings-repository";
import { createFakeSoundPlayer } from "@/testing/fake-sound-player";
import { createFakeSyncStore } from "@/testing/fake-sync-store";
import { testRandomBytes } from "@/testing/random-bytes";
import { ImportScreen } from "./import-screen";

const mockReplace = jest.fn();
const mockSetParams = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, setParams: mockSetParams }),
}));

const TODAY = localDate("2026-10-30");
const content = createCorpus([{ exercises: allExercises, passages: [passage], lessons: [lesson] }]);
const itemIds = [...new Set(allExercises.flatMap((e) => e.itemIds))];

/** The old address's log: the lesson done today, every item reviewed. */
function oldLog(): TransferredEvent[] {
  const envelope = (n: number) => ({
    id: `019a3456-7890-7abc-8def-${String(n).padStart(12, "0")}`,
    occurredAt: 1_000 + n,
    localDate: TODAY,
  });
  return [
    ...itemIds.map((itemId, i) => ({
      ...envelope(i),
      type: "item_reviewed",
      payload: { v: 1, sessionId: "s1", itemId, grade: 5 },
    })),
    {
      ...envelope(itemIds.length),
      type: "session_completed",
      payload: {
        v: 1,
        sessionId: "s1",
        kind: "lesson",
        lessonId: lesson.id,
        answerXp: 60,
        accuracy: 1,
      },
    },
  ];
}

/** Imports into an event log whose fold the screen then reads (like the SQLite adapter). */
function createLog() {
  const log: StoredEvent[] = [];
  const fold = () => foldEvents(log);
  return {
    log,
    transfer: {
      getAllEvents: async () => [...log],
      importEvents: jest.fn(async (events: readonly StoredEvent[]) => {
        const fresh = events.filter((e) => !log.some((s) => s.id === e.id));
        log.push(...fresh);
        return fresh.length;
      }),
    },
    progressRepository: {
      ...createFakeRepository(),
      getXp: async () => fold().xp,
      getStreak: async () => fold().streak,
      getReviewStates: async () => fold().states,
      getPlacementResult: async () => fold().placement,
    },
  };
}

function renderImport({
  fragment = "#t=tok-1",
  claimTransfer = async () => ({ events: oldLog() }),
}: {
  fragment?: string;
  claimTransfer?: (token: string) => Promise<{ events: ReturnType<typeof oldLog> }>;
} = {}) {
  const order: string[] = [];
  const { log, transfer, progressRepository } = createLog();
  const localChanges = createChangeSignal();
  const changes = jest.fn();
  localChanges.subscribe(changes);
  const claim = jest.fn(async (token: string) => {
    order.push(`claim:${token}`);
    return claimTransfer(token);
  });
  const account: AccountContextValue = {
    availability: "available",
    session: { status: "signed-out" },
    syncStatus: { kind: "idle" },
    progressVersion: 0,
    actions: null,
  };
  const view = render(
    <AppServicesProvider
      services={{
        progressRepository,
        clock: { today: () => TODAY, nowMs: () => 0 },
        random: () => 0,
        randomBytes: testRandomBytes,
        deviceId: "new-device",
        settingsRepository: createFakeSettingsRepository(),
        sounds: createFakeSoundPlayer(),
        account: { syncStore: createFakeSyncStore(), localChanges },
        transfer,
      }}
    >
      <AccountContext value={account}>
        <ImportScreen
          readFragment={() => fragment}
          clearFragment={() => order.push("cleared")}
          api={{ claimTransfer: claim }}
          oldOrigin="https://english-learn-iwl.pages.dev"
          assign={(url) => order.push(`assign:${url}`)}
          content={content}
        />
      </AccountContext>
    </AppServicesProvider>,
  );
  return { view, order, log, transfer, claim, changes };
}

beforeEach(() => jest.clearAllMocks());

describe("ImportScreen", () => {
  it("removes the token from the address first, imports, and shows what arrived", async () => {
    const { view, order, log, changes } = renderImport();
    await view;

    expect(await screen.findByText("¡Tu progreso llegó!")).toBeOnTheScreen();
    expect(order).toEqual(["cleared", "claim:tok-1"]);
    // Out of the router's state too, or it would put the fragment back in the address bar.
    expect(mockSetParams).toHaveBeenCalledWith({ "#": "" });
    expect(log.every((e) => e.deviceId === "new-device")).toBe(true);
    expect(screen.getByText("80 XP")).toBeOnTheScreen();
    expect(screen.getByText("Racha: 1 día")).toBeOnTheScreen();
    expect(screen.getByText("Lecciones completadas: 1")).toBeOnTheScreen();
    // The sync (when signed in) uploads the imported events like any local change.
    expect(changes).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByRole("button", { name: "Ir al inicio" }));
    expect(mockReplace).toHaveBeenCalledWith("/");
  });

  it("explains an expired or used link and offers to repeat from the old address", async () => {
    const { view, order } = renderImport({
      claimTransfer: async () => {
        throw new ApiError(404, "transfer_not_found", "gone");
      },
    });
    await view;

    expect(await screen.findByRole("alert")).toHaveTextContent(/ya se usó o venció/);
    await fireEvent.press(screen.getByRole("button", { name: "Volver al sitio anterior" }));
    expect(order).toContain("assign:https://english-learn-iwl.pages.dev/?transferir=1");
  });

  it("lets the learner retry after a network failure, with the token kept in memory", async () => {
    let attempts = 0;
    const { view, claim } = renderImport({
      claimTransfer: async () => {
        attempts += 1;
        if (attempts === 1) throw new TypeError("Failed to fetch");
        return { events: oldLog() };
      },
    });
    await view;

    expect(await screen.findByRole("alert")).toHaveTextContent(/No hay conexión/);
    await fireEvent.press(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByText("¡Tu progreso llegó!")).toBeOnTheScreen();
    expect(claim).toHaveBeenNthCalledWith(2, "tok-1");
  });

  it("says when the link carries no transfer", async () => {
    const { view, claim } = renderImport({ fragment: "" });
    await view;

    expect(await screen.findByRole("alert")).toHaveTextContent(/no trae progreso/);
    expect(claim).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "Ir al inicio" }));
    expect(mockReplace).toHaveBeenCalledWith("/");
  });
});
