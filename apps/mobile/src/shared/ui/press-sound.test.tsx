import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { AppServicesProvider, type AppServices } from "@/infrastructure/services/app-services";
import type { SoundPlayer } from "@/infrastructure/sound/sound-player";
import { BackArrowButton } from "@/shared/navigation/back-arrow-button";
import { createFakeSoundPlayer, type FakeSoundPlayer } from "@/testing/fake-sound-player";
import { Button } from "./button";
import { ChoiceRow } from "./choice-row";
import { PaperStrip } from "./paper-strip";
import { PRESS_SOUND_THROTTLE_MS } from "./press-sound";
import { PressableScale } from "./pressable-scale";
import { SoundToggleButton } from "./sound-toggle-button";

const onPress = jest.fn();
let sounds: FakeSoundPlayer;
let now: number;

beforeEach(() => {
  jest.clearAllMocks();
  sounds = createFakeSoundPlayer();
  // Far apart by default: each press is a new, unthrottled one unless a test says otherwise.
  now = 1_000_000;
  jest.spyOn(Date, "now").mockImplementation(() => (now += 10 * PRESS_SOUND_THROTTLE_MS));
});

afterEach(() => jest.restoreAllMocks());

function renderWithSounds(ui: ReactElement, player: SoundPlayer = sounds) {
  // Only the sound player matters to these primitives.
  const services = { sounds: player } as unknown as AppServices;
  return render(<AppServicesProvider services={services}>{ui}</AppServicesProvider>);
}

const pressButton = (name: string) => fireEvent.press(screen.getByRole("button", { name }));

describe("press sound", () => {
  it("plays the press click once per press of a button", async () => {
    await renderWithSounds(<Button label="Continuar" onPress={onPress} />);

    await pressButton("Continuar");

    expect(sounds.played).toEqual(["press"]);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("plays nothing for a disabled button", async () => {
    await renderWithSounds(<Button label="Comprobar" onPress={onPress} disabled />);

    await pressButton("Comprobar");

    expect(sounds.played).toEqual([]);
    expect(onPress).not.toHaveBeenCalled();
  });

  it("plays nothing while sounds are off, and the press still goes through", async () => {
    sounds.setEnabled(false);
    await renderWithSounds(<Button label="Continuar" onPress={onPress} />);

    await pressButton("Continuar");

    expect(sounds.played).toEqual([]);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("skips the click when the press plays its own sound (opt-out)", async () => {
    await renderWithSounds(<Button label="Comprobar" onPress={onPress} pressSound={false} />);

    await pressButton("Comprobar");

    expect(sounds.played).toEqual([]);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("throttles fast repeated taps, then clicks again", async () => {
    await renderWithSounds(<Button label="Continuar" onPress={onPress} />);
    let clock = 5_000;
    jest.spyOn(Date, "now").mockImplementation(() => clock);

    await pressButton("Continuar");
    clock += PRESS_SOUND_THROTTLE_MS - 1;
    await pressButton("Continuar");
    clock += 1;
    await pressButton("Continuar");

    expect(sounds.played).toEqual(["press", "press"]);
    expect(onPress).toHaveBeenCalledTimes(3);
  });

  it("shares the throttle between buttons (one tap, one click)", async () => {
    await renderWithSounds(
      <>
        <Button label="Uno" onPress={onPress} />
        <Button label="Dos" onPress={onPress} />
      </>,
    );
    jest.spyOn(Date, "now").mockReturnValue(7_000);

    await pressButton("Uno");
    await pressButton("Dos");

    expect(sounds.played).toEqual(["press"]);
  });

  it("never lets a failing player block the press", async () => {
    const broken: SoundPlayer = {
      play: () => {
        throw new Error("audio gone");
      },
      setEnabled: () => {},
    };
    await renderWithSounds(<Button label="Continuar" onPress={onPress} />, broken);

    await pressButton("Continuar");

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("clicks on the shared pressable (path nodes, rows, header links)", async () => {
    await renderWithSounds(
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="Mi rutina"
        onPress={onPress}
      />,
    );

    await pressButton("Mi rutina");

    expect(sounds.played).toEqual(["press"]);
  });

  it("clicks on an answer choice unless its list plays the tap", async () => {
    await renderWithSounds(
      <>
        <ChoiceRow label="have" checked={false} disabled={false} onPress={onPress} />
        <ChoiceRow
          label="has"
          checked={false}
          disabled={false}
          onPress={onPress}
          pressSound={false}
        />
        <ChoiceRow label="had" checked={false} disabled onPress={onPress} />
      </>,
    );

    await fireEvent.press(screen.getByRole("radio", { name: "have" }));
    await fireEvent.press(screen.getByRole("radio", { name: "has" }));
    await fireEvent.press(screen.getByRole("radio", { name: "had" }));

    expect(sounds.played).toEqual(["press"]);
    expect(onPress).toHaveBeenCalledTimes(2);
  });

  it("clicks on a word tile unless the exercise plays the tap", async () => {
    await renderWithSounds(
      <>
        <PaperStrip label="wake" text="wake" disabled={false} onPress={onPress} />
        <PaperStrip label="up" text="up" disabled={false} onPress={onPress} pressSound={false} />
        <PaperStrip label="go" text="go" disabled onPress={onPress} />
      </>,
    );

    await pressButton("wake");
    await pressButton("up");
    await pressButton("go");

    expect(sounds.played).toEqual(["press"]);
  });

  it("clicks on the header's back arrow", async () => {
    await renderWithSounds(<BackArrowButton label="Volver" onPress={onPress} />);

    await pressButton("Volver");

    expect(sounds.played).toEqual(["press"]);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("clicks on the sound switch after it flips: when sounds come on, not when they go off", async () => {
    const toggle = jest.fn(() => sounds.setEnabled(!sounds.enabled()));
    await renderWithSounds(<SoundToggleButton enabled onToggle={toggle} />);

    await pressButton("Silenciar sonidos");
    expect(sounds.played).toEqual([]);

    await pressButton("Silenciar sonidos");
    expect(sounds.played).toEqual(["press"]);
    expect(toggle).toHaveBeenCalledTimes(2);
  });
});
