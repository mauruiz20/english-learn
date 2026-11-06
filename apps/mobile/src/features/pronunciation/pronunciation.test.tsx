import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { Text } from "react-native";
import { AppServicesProvider, type AppServices } from "@/infrastructure/services/app-services";
import { createFakeSettingsRepository } from "@/testing/fake-settings-repository";
import { createFakeSoundPlayer } from "@/testing/fake-sound-player";
import { FAKE_VOICES, createFakeSpeech, type FakeSpeech } from "@/testing/fake-speech";
import { PronunciationProvider, usePronunciation } from "./pronunciation";
import { PronunciationSettingsButton } from "./pronunciation-settings";
import { SpeakButton } from "./speak-button";

async function renderWith(
  ui: ReactNode,
  {
    speech = createFakeSpeech(),
    settings = createFakeSettingsRepository(),
  }: {
    speech?: FakeSpeech | null;
    settings?: ReturnType<typeof createFakeSettingsRepository>;
  } = {},
) {
  const services = {
    settingsRepository: settings,
    sounds: createFakeSoundPlayer(),
    ...(speech === null ? {} : { speech }),
  } as unknown as AppServices;
  await render(
    <AppServicesProvider services={services}>
      <PronunciationProvider>{ui}</PronunciationProvider>
    </AppServicesProvider>,
  );
  return { speech: speech ?? undefined, settings };
}

const SAMANTHA = FAKE_VOICES[0]!.id;
const DANIEL = FAKE_VOICES[1]!.id;

function Probe() {
  const p = usePronunciation();
  return <Text testID="probe">{`${p.available}|${p.enabled}|${p.rate}`}</Text>;
}

function ReadyProbe() {
  const p = usePronunciation();
  return <Text testID="ready">{p.ready ? `true|${p.available}` : "false"}</Text>;
}

describe("PronunciationProvider", () => {
  it("is on at normal speed by default when the device can speak English", async () => {
    await renderWith(<Probe />);
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent("true|true|normal"));
  });

  it("reads the stored switch and speed", async () => {
    await renderWith(<Probe />, {
      settings: createFakeSettingsRepository({ pronunciationEnabled: false, speechRate: "slow" }),
    });
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent("false|false|slow"));
  });

  it("gives the stored voice to the speech service", async () => {
    const speech = createFakeSpeech();
    await renderWith(<Probe />, {
      speech,
      settings: createFakeSettingsRepository({ speechVoice: DANIEL }),
    });
    await waitFor(() => expect(speech.preferredVoice()).toBe(DANIEL));
    expect(speech.getSnapshot().voiceId).toBe(DANIEL);
  });

  it("is ready once the stored switch is known (sessions plan listening after that)", async () => {
    let resolve: (enabled: boolean) => void = () => {};
    const settings = createFakeSettingsRepository();
    settings.getPronunciationEnabled = () => new Promise((r) => (resolve = r));
    await renderWith(<ReadyProbe />, { settings });
    expect(screen.getByTestId("ready")).toHaveTextContent("false");
    await act(async () => resolve(false));
    expect(screen.getByTestId("ready")).toHaveTextContent("true|false");
  });

  it("is unavailable without a speech service (native) or an English voice", async () => {
    await renderWith(<Probe />, { speech: null });
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent("false|true|normal"));
  });

  it("follows voices that load later", async () => {
    const speech = createFakeSpeech({ available: false });
    await renderWith(<Probe />, { speech });
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent(/^false\|true/u));
    await act(() => speech.setAvailable(true));
    expect(screen.getByTestId("probe")).toHaveTextContent(/^true\|true/u);
  });

  it("is unavailable outside the provider, without throwing", async () => {
    await render(<Probe />);
    expect(screen.getByTestId("probe")).toHaveTextContent("false|false|normal");
  });
});

describe("SpeakButton", () => {
  it("speaks its text with the English voice at the learner's speed", async () => {
    const { speech } = await renderWith(<SpeakButton text="I get up at six." />);
    await fireEvent.press(
      await screen.findByRole("button", { name: "Escuchar: I get up at six." }),
    );
    expect(speech?.spoken).toEqual([
      expect.objectContaining({ text: "I get up at six.", rate: 1 }),
    ]);
  });

  it("plays every tap at the learner's speed (no hidden speed toggle)", async () => {
    const { speech } = await renderWith(<SpeakButton text="Hello." />);
    const button = await screen.findByRole("button", { name: "Escuchar: Hello." });
    expect(button.props.accessibilityHint).toBeUndefined();
    await fireEvent.press(button);
    await fireEvent.press(button);
    await fireEvent.press(button);
    expect(speech?.spoken.map((s) => s.rate)).toEqual([1, 1, 1]);
  });

  it("plays every tap slowly when the learner picked Lenta, never faster", async () => {
    const { speech } = await renderWith(<SpeakButton text="Hello." />, {
      settings: createFakeSettingsRepository({ speechRate: "slow" }),
    });
    const button = await screen.findByRole("button", { name: "Escuchar: Hello." });
    await fireEvent.press(button);
    await fireEvent.press(button);
    expect(speech?.spoken.map((s) => s.rate)).toEqual([0.7, 0.7]);
  });

  it("shows that it is speaking until the speech ends", async () => {
    const { speech } = await renderWith(<SpeakButton text="Hello." />);
    const button = await screen.findByRole("button", { name: "Escuchar: Hello." });
    await fireEvent.press(button);
    expect(screen.getByRole("button", { name: "Escuchar: Hello." })).toBeBusy();
    await act(() => speech?.finish());
    expect(screen.getByRole("button", { name: "Escuchar: Hello." })).not.toBeBusy();
  });

  it("only the button that speaks shows it", async () => {
    await renderWith(
      <>
        <SpeakButton text="One." />
        <SpeakButton text="Two." />
      </>,
    );
    await fireEvent.press(await screen.findByRole("button", { name: "Escuchar: One." }));
    expect(screen.getByRole("button", { name: "Escuchar: Two." })).not.toBeBusy();
  });

  it("can carry a shorter label for long texts", async () => {
    await renderWith(
      <SpeakButton text="A long passage. With sentences." label="Escuchar el texto" />,
    );
    expect(await screen.findByRole("button", { name: "Escuchar el texto" })).toBeTruthy();
  });

  it.each([
    [
      "pronunciation is off",
      { settings: createFakeSettingsRepository({ pronunciationEnabled: false }) },
    ],
    ["the device has no English voice", { speech: createFakeSpeech({ available: false }) }],
    ["there is no speech service (native)", { speech: null }],
  ])("is hidden when %s", async (_case, options) => {
    await renderWith(<SpeakButton text="Hello." />, options);
    await act(async () => {});
    expect(screen.queryByRole("button", { name: /Escuchar/u })).toBeNull();
  });

  it("speaks nothing for blank text", async () => {
    await renderWith(<SpeakButton text="   " />);
    await act(async () => {});
    expect(screen.queryByRole("button", { name: /Escuchar/u })).toBeNull();
  });
});

describe("PronunciationSettingsButton", () => {
  it("turns pronunciation off and on, saves it and hides the speaker buttons", async () => {
    const { settings, speech } = await renderWith(
      <>
        <PronunciationSettingsButton />
        <SpeakButton text="Hello." />
      </>,
    );
    await fireEvent.press(await screen.findByRole("button", { name: "Pronunciación" }));
    const toggle = screen.getByRole("switch", { name: "Pronunciación" });
    expect(toggle).toBeChecked();

    await fireEvent.press(toggle);

    expect(screen.getByRole("switch", { name: "Pronunciación" })).not.toBeChecked();
    await waitFor(() => expect(settings.pronunciationEnabled()).toBe(false));
    // Turning it off stops what is being said.
    expect(speech?.cancels()).toBeGreaterThan(0);
    await fireEvent.press(screen.getByRole("button", { name: "Listo" }));
    expect(screen.queryByRole("button", { name: "Escuchar: Hello." })).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "Pronunciación" }));
    await fireEvent.press(screen.getByRole("switch", { name: "Pronunciación" }));
    await waitFor(() => expect(settings.pronunciationEnabled()).toBe(true));
    await fireEvent.press(screen.getByRole("button", { name: "Listo" }));
    expect(screen.getByRole("button", { name: "Escuchar: Hello." })).toBeTruthy();
  });

  it("picks the voice speed and saves it", async () => {
    const { settings, speech } = await renderWith(
      <>
        <PronunciationSettingsButton />
        <SpeakButton text="Hello." />
      </>,
    );
    await fireEvent.press(await screen.findByRole("button", { name: "Pronunciación" }));
    await fireEvent.press(screen.getByRole("radio", { name: "Lenta" }));
    expect(screen.getByRole("radio", { name: "Lenta" })).toBeChecked();
    await waitFor(() => expect(settings.speechRate()).toBe("slow"));
    await fireEvent.press(screen.getByRole("button", { name: "Listo" }));

    await fireEvent.press(screen.getByRole("button", { name: "Escuchar: Hello." }));
    expect(speech?.spoken.at(-1)?.rate).toBe(0.7);
  });

  it("lists the English voices under Voz, Automática first and checked by default", async () => {
    await renderWith(<PronunciationSettingsButton />);
    await fireEvent.press(await screen.findByRole("button", { name: "Pronunciación" }));
    expect(screen.getByLabelText("Voz")).toBeOnTheScreen();
    const radios = screen
      .getAllByRole("radio")
      .map((r) => r.props.accessibilityLabel as string)
      .filter((label) => label !== "Normal" && label !== "Lenta");
    expect(radios).toEqual(["Automática (Samantha)", "Samantha, EE. UU.", "Daniel, Reino Unido"]);
    expect(screen.getByRole("radio", { name: "Automática (Samantha)" })).toBeChecked();
  });

  it("picks a voice, saves it on the device and speaks with it; Automática goes back", async () => {
    const { settings, speech } = await renderWith(
      <>
        <PronunciationSettingsButton />
        <SpeakButton text="Hello." />
      </>,
    );
    await fireEvent.press(await screen.findByRole("button", { name: "Pronunciación" }));
    await fireEvent.press(screen.getByRole("radio", { name: "Daniel, Reino Unido" }));
    expect(screen.getByRole("radio", { name: "Daniel, Reino Unido" })).toBeChecked();
    await waitFor(() => expect(settings.speechVoice()).toBe(DANIEL));
    expect(speech?.preferredVoice()).toBe(DANIEL);
    await fireEvent.press(screen.getByRole("button", { name: "Listo" }));
    await fireEvent.press(screen.getByRole("button", { name: "Escuchar: Hello." }));
    expect(speech?.spoken.at(-1)?.voice).toBe(DANIEL);

    await fireEvent.press(screen.getByRole("button", { name: "Pronunciación" }));
    await fireEvent.press(screen.getByRole("radio", { name: "Automática (Samantha)" }));
    await waitFor(() => expect(settings.speechVoice()).toBeNull());
    expect(speech?.preferredVoice()).toBeNull();
  });

  it("tries a voice with Probar at the learner's speed, without picking it", async () => {
    const { settings, speech } = await renderWith(<PronunciationSettingsButton />, {
      settings: createFakeSettingsRepository({ speechRate: "slow" }),
    });
    await fireEvent.press(await screen.findByRole("button", { name: "Pronunciación" }));
    await fireEvent.press(screen.getByRole("button", { name: "Probar la voz Daniel" }));
    expect(speech?.spoken.at(-1)).toMatchObject({ voice: DANIEL, rate: 0.7 });
    expect(speech?.spoken.at(-1)?.text).toMatch(/[A-Za-z]/u);
    expect(settings.speechVoice()).toBeNull();
    expect(screen.getByRole("radio", { name: "Automática (Samantha)" })).toBeChecked();
    expect(speech?.getSnapshot().voiceId).toBe(SAMANTHA);
  });

  it("is not shown when the device cannot speak English", async () => {
    await renderWith(<PronunciationSettingsButton />, {
      speech: createFakeSpeech({ available: false }),
    });
    await act(async () => {});
    expect(screen.queryByRole("button", { name: "Pronunciación" })).toBeNull();
  });
});
