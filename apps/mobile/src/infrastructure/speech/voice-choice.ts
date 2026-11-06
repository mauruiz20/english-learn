/** The parts of a `SpeechSynthesisVoice` the app reads. */
export type VoiceLike = {
  readonly name: string;
  readonly lang: string;
  readonly localService: boolean;
  readonly default: boolean;
  readonly voiceURI: string;
};

/** Names that mark a better voice where browsers offer several (Apple, Microsoft, Google). */
const QUALITY = /\b(premium|enhanced|neural|natural|siri)\b/iu;

const langOf = (voice: VoiceLike) => voice.lang.replace(/_/gu, "-").toLowerCase();

/**
 * The English voice to speak with, deterministically, or null when there is none:
 *
 * 1. Only voices on the device (`localService`): a network voice would send the text to a
 *    server, and the app makes no network calls at runtime (and works offline).
 * 2. American English (`en-US`) first, then any other English.
 * 3. A higher quality voice ("Premium", "Enhanced", "Neural", "Natural", "Siri"), then the
 *    browser's default, then the name (so the order browsers list voices in never matters).
 */
export function pickEnglishVoice<V extends VoiceLike>(voices: readonly V[]): V | null {
  const candidates = voices.filter((v) => v.localService && /^en(-|$)/u.test(langOf(v)));
  const rank = (v: VoiceLike): [number, number, number] => [
    langOf(v) === "en-us" ? 0 : 1,
    QUALITY.test(v.name) ? 0 : 1,
    v.default ? 0 : 1,
  ];
  const sorted = [...candidates].sort((a, b) => {
    const [ra, rb] = [rank(a), rank(b)];
    for (let i = 0; i < ra.length; i++) {
      const diff = (ra[i] ?? 0) - (rb[i] ?? 0);
      if (diff !== 0) return diff;
    }
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
  return sorted[0] ?? null;
}

/** Longest chunk spoken in one utterance (engines cut off or stall on long ones). */
export const MAX_CHUNK = 200;

/**
 * Splits a text into chunks of at most `max` characters at sentence ends (then at spaces), so a
 * reading passage is queued as several short utterances. Blank text gives no chunk.
 */
export function splitForSpeech(text: string, max = MAX_CHUNK): string[] {
  const clean = text.replace(/\s+/gu, " ").trim();
  if (clean === "") return [];
  const sentences = clean.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/gu) ?? [clean];
  const chunks: string[] = [];
  let current = "";
  const push = (piece: string) => {
    if (current === "") current = piece;
    else if (current.length + 1 + piece.length <= max) current = `${current} ${piece}`;
    else {
      chunks.push(current);
      current = piece;
    }
  };
  for (const raw of sentences) {
    const sentence = raw.trim();
    if (sentence === "") continue;
    if (sentence.length <= max) {
      push(sentence);
      continue;
    }
    for (const word of sentence.split(" ")) push(word);
  }
  if (current !== "") chunks.push(current);
  return chunks;
}
