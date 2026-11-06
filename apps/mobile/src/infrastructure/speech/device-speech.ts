import { unsupportedSpeech, type SpeechService } from "./speech-service";

/**
 * Native: no pronunciation yet (expo-speech is not a dependency, and the web app is the product),
 * so every speaker button stays hidden. Metro picks `device-speech.web.ts` on web.
 */
export function createDeviceSpeech(): SpeechService {
  return unsupportedSpeech;
}
