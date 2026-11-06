import { unsupportedSpeech, type SpeechService } from "./speech-service";
import { createWebSpeechService, type SynthLike, type UtteranceLike } from "./web-speech-service";

/**
 * The web `SpeechService`: the browser's `speechSynthesis` (Metro picks this file over
 * `device-speech.ts` on web). Without it (old browsers, some web views) it is unsupported.
 */
export function createDeviceSpeech(): SpeechService {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return unsupportedSpeech;
  if (typeof SpeechSynthesisUtterance === "undefined") return unsupportedSpeech;
  const synth = window.speechSynthesis as unknown as SynthLike | null | undefined;
  if (synth === undefined || synth === null) return unsupportedSpeech;
  return createWebSpeechService({
    synth,
    createUtterance: (text) => new SpeechSynthesisUtterance(text) as unknown as UtteranceLike,
    document: window.document,
    window,
    timers: {
      setTimeout: (run, ms) => globalThis.setTimeout(run, ms),
      clearTimeout: (id) => globalThis.clearTimeout(id as ReturnType<typeof setTimeout>),
    },
  });
}
