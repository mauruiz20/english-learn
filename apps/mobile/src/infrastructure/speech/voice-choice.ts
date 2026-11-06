/** The parts of a `SpeechSynthesisVoice` the app reads. */
export type VoiceLike = {
  readonly name: string;
  readonly lang: string;
  readonly localService: boolean;
  readonly default: boolean;
  readonly voiceURI: string;
};

const langOf = (voice: VoiceLike) => voice.lang.replace(/_/gu, "-").toLowerCase();

/** "Bad News (English (US))" -> "badnews": the voice's own name, without its language. */
const keyOf = (name: string) =>
  name
    .replace(/\s*\(.*$/u, "")
    .toLowerCase()
    .replace(/[^a-z]/gu, "");

/**
 * The old MacinTalk voice an Apple URI names ("com.apple.speech.synthesis.voice.BadNews" ->
 * "badnews"), or "" for other URIs. Renamed novelty voices keep their old ids (Jester is
 * "Hysterical", Superstar "Princess", Wobble "Deranged").
 */
const macinTalkKeyOf = (uri: string) =>
  /com\.apple\.speech\.synthesis\.voice\.([a-z]+)/iu.exec(uri)?.[1]?.toLowerCase() ?? "";

/** Apple's novelty voices (iOS 17+ lists them as ordinary local en-US voices). */
const NOVELTY = new Set([
  "albert",
  "badnews",
  "bahh",
  "bells",
  "boing",
  "bubbles",
  "cellos",
  "goodnews",
  "jester",
  "hysterical",
  "organ",
  "pipeorgan",
  "superstar",
  "princess",
  "trinoids",
  "whisper",
  "wobble",
  "deranged",
  "zarvox",
]);

/** Apple's Eloquence voices (URIs `com.apple.eloquence.<lang>.<Name>`): robotic, muffled. */
const ELOQUENCE = new Set([
  "eddy",
  "flo",
  "grandma",
  "grandpa",
  "reed",
  "rocko",
  "sandy",
  "shelley",
]);

/** Old compact MacinTalk voices: usable, but the last resort. */
const LEGACY = new Set(["fred", "junior", "kathy", "ralph", "agnes", "bruce", "vicki", "victoria"]);

/** Apple's natural-sounding American voices, good even in their compact versions. */
const GOOD = new Set([
  "samantha",
  "ava",
  "allison",
  "susan",
  "tom",
  "alex",
  "nicky",
  "zoe",
  "evan",
  "nathan",
  "joelle",
]);

const PREMIUM = /premium/iu;
const ENHANCED_NAME = /\b(enhanced|neural|natural|siri)\b/iu;
const ENHANCED_URI = /enhanced|(^|[^a-z])siri[_.]/iu;
const SUPER_COMPACT = /super-?compact/iu;

/**
 * An English voice on the device (`localService`: a network voice would send the text to a
 * server, and the app makes no network calls at runtime) that is not a novelty nor an Eloquence
 * voice (by name and by URI).
 */
export function isUsableVoice(voice: VoiceLike): boolean {
  if (!voice.localService || !/^en(-|$)/u.test(langOf(voice))) return false;
  const name = keyOf(voice.name);
  const macinTalk = macinTalkKeyOf(voice.voiceURI);
  if (NOVELTY.has(name) || NOVELTY.has(macinTalk)) return false;
  if (/com\.apple\.eloquence\./iu.test(voice.voiceURI) || ELOQUENCE.has(name)) return false;
  return true;
}

/**
 * Quality tier, lower is better: 0 Premium, 1 Enhanced / Neural / Natural / Siri, 2 a known good
 * voice (Samantha, Ava…), 3 the system default for en-US, 4 other en-US, 5 other English, 6 the
 * legacy compact voices (Fred, Junior, Kathy, Ralph).
 */
function tierOf(voice: VoiceLike, defaultCounts: boolean): number {
  const name = keyOf(voice.name);
  if (LEGACY.has(name) || LEGACY.has(macinTalkKeyOf(voice.voiceURI))) return 6;
  if (PREMIUM.test(voice.name) || PREMIUM.test(voice.voiceURI)) return 0;
  if (ENHANCED_NAME.test(voice.name) || ENHANCED_URI.test(voice.voiceURI)) return 1;
  if (GOOD.has(name)) return 2;
  const american = langOf(voice) === "en-us";
  if (american && defaultCounts && voice.default) return 3;
  return american ? 4 : 5;
}

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The usable English voices (`isUsableVoice`), best first, deterministically (the order browsers
 * list voices in never matters):
 *
 * 1. Quality tier (`tierOf`): Premium, Enhanced, known good voices, the en-US default, other
 *    en-US, other English, legacy compact voices last.
 * 2. American English (`en-US`) first within a tier.
 * 3. A super-compact voice after the compact one.
 * 4. The name, then the URI.
 *
 * WebKit marks every voice `default`, so the default only counts when some voice is not.
 */
export function rankEnglishVoices<V extends VoiceLike>(voices: readonly V[]): V[] {
  const candidates = voices.filter(isUsableVoice);
  const defaultCounts = candidates.some((v) => !v.default);
  const rank = (v: VoiceLike): number[] => [
    tierOf(v, defaultCounts),
    langOf(v) === "en-us" ? 0 : 1,
    SUPER_COMPACT.test(v.voiceURI) ? 1 : 0,
  ];
  return [...candidates].sort((a, b) => {
    const [ra, rb] = [rank(a), rank(b)];
    for (let i = 0; i < ra.length; i++) {
      const diff = (ra[i] ?? 0) - (rb[i] ?? 0);
      if (diff !== 0) return diff;
    }
    return compare(a.name, b.name) || compare(a.voiceURI, b.voiceURI);
  });
}

/** The English voice to speak with (the best of `rankEnglishVoices`), or null when there is none. */
export function pickEnglishVoice<V extends VoiceLike>(voices: readonly V[]): V | null {
  return rankEnglishVoices(voices)[0] ?? null;
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
