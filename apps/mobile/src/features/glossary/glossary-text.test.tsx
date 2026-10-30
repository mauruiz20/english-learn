import { buildGlossaryIndex, type GlossaryEntry } from "@english-learn/domain";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { AppServicesProvider } from "@/infrastructure/services/app-services";
import { createFakeRepository } from "@/testing/fake-progress-repository";
import { createFakeSettingsRepository } from "@/testing/fake-settings-repository";
import { createFakeSoundPlayer } from "@/testing/fake-sound-player";
import { GlossaryProvider } from "./glossary-provider";
import { GlossaryText } from "./glossary-text";
import { LookupHint } from "./lookup-hint";
import { testRandomBytes } from "@/testing/random-bytes";

const ENTRIES: readonly GlossaryEntry[] = [
  {
    id: "glossary.i",
    headword: "I",
    kind: "word",
    forms: ["i"],
    senses: [{ es: "yo", pos: "pronoun" }],
  },
  {
    id: "glossary.wake-up",
    headword: "wake up",
    kind: "phrase",
    forms: ["wake up", "woke up"],
    senses: [{ es: "despertarse", pos: "phrasal verb" }],
  },
  {
    id: "glossary.early",
    headword: "early",
    kind: "word",
    forms: ["early"],
    senses: [
      { es: "temprano", pos: "adverb" },
      { es: "primero", pos: "adjective" },
    ],
  },
];
const INDEX = buildGlossaryIndex(ENTRIES);

function setup({
  hintDismissed = true,
  muted = false,
}: { hintDismissed?: boolean; muted?: boolean } = {}) {
  const sounds = createFakeSoundPlayer();
  sounds.setEnabled(!muted);
  const settingsRepository = createFakeSettingsRepository({ lookupHintDismissed: hintDismissed });
  const onLookup = jest.fn();
  const services = {
    progressRepository: createFakeRepository(),
    clock: { today: () => "2026-10-30" as never, nowMs: () => 0 },
    random: () => 0.5,
    randomBytes: testRandomBytes,
    deviceId: "test-device",
    settingsRepository,
    sounds,
  };
  const wrap = (children: ReactNode) => (
    <AppServicesProvider services={services}>
      <GlossaryProvider index={INDEX} onLookup={onLookup}>
        {children}
      </GlossaryProvider>
    </AppServicesProvider>
  );
  return { sounds, settingsRepository, onLookup, wrap };
}

const target = (word: string) => screen.queryByRole("button", { name: `${word}, ver traducción` });

describe("GlossaryText", () => {
  it("shows the Spanish senses of a tapped word", async () => {
    const { wrap } = setup();
    await render(wrap(<GlossaryText text="I woke up early." />));

    await fireEvent.press(target("early")!);

    expect(screen.getByText("temprano")).toBeOnTheScreen();
    expect(screen.getByText("primero")).toBeOnTheScreen();
    expect(screen.getByText("adverbio")).toBeOnTheScreen();
  });

  it("makes a phrase one lookup target that spans its words", async () => {
    const { wrap } = setup();
    await render(wrap(<GlossaryText text="I woke up early." />));

    expect(target("woke")).toBeNull();
    await fireEvent.press(target("woke up")!);

    expect(screen.getByText("wake up")).toBeOnTheScreen();
    expect(screen.getByText("despertarse")).toBeOnTheScreen();
  });

  it("keeps the text readable as one sentence", async () => {
    const { wrap } = setup();
    await render(wrap(<GlossaryText text="I woke up early." />));

    expect(screen.getByText("I woke up early.")).toBeOnTheScreen();
  });

  it("does not make locked words pressable", async () => {
    const { wrap } = setup();
    const text = "I woke up early.";
    await render(wrap(<GlossaryText text={text} lockedRanges={[[2, 9]]} />));

    expect(target("woke up")).toBeNull();
    expect(target("early")).toBeOnTheScreen();
    expect(screen.getByText(text)).toBeOnTheScreen();
  });

  it("does not link anything when lookups are off", async () => {
    const { wrap } = setup();
    await render(wrap(<GlossaryText text="I woke up early." enabled={false} />));

    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("renders plain text outside a glossary provider (e.g. the placement test)", async () => {
    await render(<GlossaryText text="I woke up early." />);

    expect(screen.getByText("I woke up early.")).toBeOnTheScreen();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("closes with the close button and with a tap outside the card", async () => {
    const { wrap } = setup();
    await render(wrap(<GlossaryText text="I woke up early." />));

    await fireEvent.press(target("early")!);
    await fireEvent.press(screen.getByRole("button", { name: "Cerrar" }));
    expect(screen.queryByText("temprano")).toBeNull();

    await fireEvent.press(target("early")!);
    await fireEvent.press(screen.getByTestId("lookup-backdrop"));
    expect(screen.queryByText("temprano")).toBeNull();
  });

  it("plays the tap sound when a lookup opens, unless sounds are muted", async () => {
    const on = setup();
    await render(on.wrap(<GlossaryText text="I woke up early." />));
    await fireEvent.press(target("early")!);
    expect(on.sounds.played).toEqual(["tap"]);

    const muted = setup({ muted: true });
    await render(muted.wrap(<GlossaryText text="I woke up early." />));
    await fireEvent.press(target("early")!);
    expect(muted.sounds.played).toEqual([]);
  });

  it("reports the looked-up entry", async () => {
    const { wrap, onLookup } = setup();
    await render(wrap(<GlossaryText text="I woke up early." />));

    await fireEvent.press(target("woke up")!);

    expect(onLookup).toHaveBeenCalledWith("glossary.wake-up");
  });
});

describe("LookupHint", () => {
  it("shows the first-time hint until the learner dismisses it, and remembers it", async () => {
    const { wrap, settingsRepository } = setup({ hintDismissed: false });
    await render(wrap(<LookupHint />));

    expect(await screen.findByText("Toca una palabra para ver su traducción")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Entendido" }));

    expect(screen.queryByText("Toca una palabra para ver su traducción")).toBeNull();
    expect(settingsRepository.lookupHintDismissed()).toBe(true);
  });

  it("is not shown once dismissed", async () => {
    const { wrap } = setup({ hintDismissed: true });
    await render(wrap(<LookupHint />));

    await waitFor(() => expect(screen.queryByText(/Toca una palabra/)).toBeNull());
  });

  it("goes away after the first lookup", async () => {
    const { wrap, settingsRepository } = setup({ hintDismissed: false });
    await render(
      wrap(
        <>
          <LookupHint />
          <GlossaryText text="I woke up early." />
        </>,
      ),
    );
    await screen.findByText("Toca una palabra para ver su traducción");

    await fireEvent.press(target("early")!);

    expect(screen.queryByText("Toca una palabra para ver su traducción")).toBeNull();
    expect(settingsRepository.lookupHintDismissed()).toBe(true);
  });
});
