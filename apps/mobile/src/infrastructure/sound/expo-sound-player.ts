import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";
import {
  createDeviceSoundPlayer,
  type AndroidHaptic,
  type HapticsPort,
} from "./device-sound-player";
import type { SoundName, SoundPlayer } from "./sound-player";

// Bundled with the app (offline; same-origin on web, so COEP `require-corp` allows them).
const SOURCES: Readonly<Record<SoundName, number>> = {
  tap: require("../../../assets/sounds/tap.wav"),
  press: require("../../../assets/sounds/press.wav"),
  correct: require("../../../assets/sounds/correct.wav"),
  almost: require("../../../assets/sounds/almost.wav"),
  wrong: require("../../../assets/sounds/wrong.wav"),
  complete: require("../../../assets/sounds/complete.wav"),
  streak: require("../../../assets/sounds/streak.wav"),
  achievement: require("../../../assets/sounds/achievement.wav"),
};

const ANDROID_HAPTICS: Readonly<Record<AndroidHaptic, Haptics.AndroidHaptics>> = {
  tap: Haptics.AndroidHaptics.Keyboard_Tap,
  confirm: Haptics.AndroidHaptics.Confirm,
  reject: Haptics.AndroidHaptics.Reject,
};

const expoHaptics: HapticsPort = {
  impactLight: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  notify: (type) =>
    Haptics.notificationAsync(
      type === "success"
        ? Haptics.NotificationFeedbackType.Success
        : type === "warning"
          ? Haptics.NotificationFeedbackType.Warning
          : Haptics.NotificationFeedbackType.Error,
    ),
  android: (type) => Haptics.performAndroidHapticsAsync(ANDROID_HAPTICS[type]),
};

/**
 * The app's `SoundPlayer`: expo-audio players created (and loaded) once, kept for the app's
 * lifetime, plus expo-haptics on iOS and Android. On iOS the silent switch is respected
 * (`playsInSilentMode: false`) and sounds mix with whatever else is playing.
 */
export function createExpoSoundPlayer(): SoundPlayer {
  if (Platform.OS !== "web") {
    setAudioModeAsync({ playsInSilentMode: false, interruptionMode: "mixWithOthers" }).catch(
      (error: unknown) => console.warn("Could not set the audio mode", error),
    );
  }
  return createDeviceSoundPlayer({
    os: Platform.OS,
    createClip: (name) => createAudioPlayer(SOURCES[name]),
    haptics: expoHaptics,
  });
}
