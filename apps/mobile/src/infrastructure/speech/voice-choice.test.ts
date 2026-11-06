import { isUsableVoice, pickEnglishVoice, rankEnglishVoices, type VoiceLike } from "./voice-choice";

/** A voice as WebKit lists it: every system voice is local AND marked default. */
function webkit(name: string, voiceURI: string, lang = "en-US"): VoiceLike {
  return { name, lang, voiceURI, localService: true, default: true };
}

/** A voice as Chrome / Edge list it: the name is the URI, one voice is the default. */
function chrome(
  name: string,
  lang: string,
  extra: Partial<Omit<VoiceLike, "name" | "lang">> = {},
): VoiceLike {
  return { name, lang, voiceURI: name, localService: true, default: false, ...extra };
}

const NOVELTY = [
  webkit("Albert", "com.apple.speech.synthesis.voice.Albert"),
  webkit("Bad News", "com.apple.speech.synthesis.voice.BadNews"),
  webkit("Bahh", "com.apple.speech.synthesis.voice.Bahh"),
  webkit("Bells", "com.apple.speech.synthesis.voice.Bells"),
  webkit("Boing", "com.apple.speech.synthesis.voice.Boing"),
  webkit("Bubbles", "com.apple.speech.synthesis.voice.Bubbles"),
  webkit("Cellos", "com.apple.speech.synthesis.voice.Cellos"),
  webkit("Good News", "com.apple.speech.synthesis.voice.GoodNews"),
  webkit("Jester", "com.apple.speech.synthesis.voice.Hysterical"),
  webkit("Organ", "com.apple.speech.synthesis.voice.Organ"),
  webkit("Superstar", "com.apple.speech.synthesis.voice.Princess"),
  webkit("Trinoids", "com.apple.speech.synthesis.voice.Trinoids"),
  webkit("Whisper", "com.apple.speech.synthesis.voice.Whisper"),
  webkit("Wobble", "com.apple.speech.synthesis.voice.Deranged"),
  webkit("Zarvox", "com.apple.speech.synthesis.voice.Zarvox"),
];

const ELOQUENCE = [
  "Eddy",
  "Flo",
  "Grandma",
  "Grandpa",
  "Reed",
  "Rocko",
  "Sandy",
  "Shelley",
].flatMap((name) => [
  webkit(`${name} (English (US))`, `com.apple.eloquence.en-US.${name}`),
  webkit(`${name} (English (UK))`, `com.apple.eloquence.en-GB.${name}`, "en-GB"),
]);

const LEGACY = [
  webkit("Fred", "com.apple.speech.synthesis.voice.Fred"),
  webkit("Junior", "com.apple.speech.synthesis.voice.Junior"),
  webkit("Kathy", "com.apple.speech.synthesis.voice.Kathy"),
  webkit("Ralph", "com.apple.speech.synthesis.voice.Ralph"),
];

/** A fresh iPhone (iOS 17+), English (US) voices not downloaded: what WebKit lists. */
const IPHONE = [
  ...NOVELTY,
  ...ELOQUENCE,
  ...LEGACY,
  webkit("Daniel", "com.apple.voice.compact.en-GB.Daniel", "en-GB"),
  webkit("Karen", "com.apple.voice.compact.en-AU.Karen", "en-AU"),
  webkit("Moira", "com.apple.voice.compact.en-IE.Moira", "en-IE"),
  webkit("Rishi", "com.apple.voice.compact.en-IN.Rishi", "en-IN"),
  webkit("Samantha", "com.apple.voice.compact.en-US.Samantha"),
  webkit("Mónica", "com.apple.voice.compact.es-ES.Monica", "es-ES"),
  webkit("Paulina", "com.apple.voice.compact.es-MX.Paulina", "es-MX"),
];

describe("rankEnglishVoices on an iPhone", () => {
  it("never picks a novelty, Eloquence or legacy voice while a good one exists", () => {
    // Before: every WebKit voice is "default", so name order picked "Albert" (a novelty voice).
    expect(pickEnglishVoice(IPHONE)?.voiceURI).toBe("com.apple.voice.compact.en-US.Samantha");
  });

  it("lists no novelty nor Eloquence voice at all", () => {
    const names = rankEnglishVoices(IPHONE).map((v) => v.voiceURI);
    for (const v of [...NOVELTY, ...ELOQUENCE]) expect(names).not.toContain(v.voiceURI);
  });

  it("orders good voices, then other English, then the legacy compact ones last", () => {
    expect(rankEnglishVoices(IPHONE).map((v) => v.name)).toEqual([
      "Samantha",
      "Daniel",
      "Karen",
      "Moira",
      "Rishi",
      "Fred",
      "Junior",
      "Kathy",
      "Ralph",
    ]);
  });

  it("prefers a downloaded Premium voice, then an Enhanced one, by URI or name", () => {
    const premium = webkit("Zoe (Premium)", "com.apple.voice.premium.en-US.Zoe");
    const enhanced = webkit("Ava (Enhanced)", "com.apple.voice.enhanced.en-US.Ava");
    expect(pickEnglishVoice([...IPHONE, enhanced])?.voiceURI).toBe(enhanced.voiceURI);
    expect(pickEnglishVoice([...IPHONE, enhanced, premium])?.voiceURI).toBe(premium.voiceURI);
    // By URI alone (some iOS versions name it plainly).
    const plain = webkit("Evan", "com.apple.voice.enhanced.en-US.Evan");
    expect(pickEnglishVoice([...IPHONE, plain])?.voiceURI).toBe(plain.voiceURI);
  });

  it("reads the older iOS ttsbundle URIs (-compact / -premium, Siri voices)", () => {
    const voices = [
      webkit("Fred", "com.apple.speech.synthesis.voice.Fred"),
      webkit("Samantha", "com.apple.ttsbundle.Samantha-compact"),
      webkit("Samantha (Enhanced)", "com.apple.ttsbundle.Samantha-premium"),
    ];
    expect(pickEnglishVoice(voices)?.voiceURI).toBe("com.apple.ttsbundle.Samantha-premium");
    const siri = webkit("Nicky", "com.apple.ttsbundle.siri_Nicky_en-US_compact");
    expect(pickEnglishVoice([voices[0]!, voices[1]!, siri])?.voiceURI).toBe(siri.voiceURI);
  });

  it("ranks a super-compact voice below the compact one of the same name", () => {
    const superCompact = webkit("Samantha", "com.apple.voice.super-compact.en-US.Samantha");
    const compact = webkit("Samantha", "com.apple.voice.compact.en-US.Samantha");
    expect(pickEnglishVoice([superCompact, compact])?.voiceURI).toBe(compact.voiceURI);
    expect(pickEnglishVoice([compact, superCompact])?.voiceURI).toBe(compact.voiceURI);
  });

  it("falls back to a legacy voice when nothing better exists, never to a novelty one", () => {
    expect(pickEnglishVoice([...NOVELTY, ...ELOQUENCE, ...LEGACY])?.name).toBe("Fred");
    expect(pickEnglishVoice([...NOVELTY, ...ELOQUENCE])).toBeNull();
  });
});

describe("rankEnglishVoices on desktops", () => {
  it("macOS Chrome: names are the URIs; the good default voice wins over Albert", () => {
    const voices = [
      chrome("Albert", "en-US"),
      chrome("Bad News", "en-US"),
      chrome("Eddy (English (US))", "en-US"),
      chrome("Fred", "en-US"),
      chrome("Samantha", "en-US", { default: true }),
      chrome("Daniel", "en-GB"),
      chrome("Google US English", "en-US", { localService: false }),
    ];
    expect(rankEnglishVoices(voices).map((v) => v.name)).toEqual(["Samantha", "Daniel", "Fred"]);
  });

  it("Windows: the system default en-US voice, then other en-US, then other English", () => {
    const voices = [
      chrome("Microsoft Zira - English (United States)", "en-US"),
      chrome("Microsoft George - English (United Kingdom)", "en-GB"),
      chrome("Microsoft David - English (United States)", "en-US", { default: true }),
      chrome("Microsoft Aria Online (Natural) - English (United States)", "en-US", {
        localService: false,
      }),
    ];
    expect(rankEnglishVoices(voices).map((v) => v.name)).toEqual([
      "Microsoft David - English (United States)",
      "Microsoft Zira - English (United States)",
      "Microsoft George - English (United Kingdom)",
    ]);
  });

  it("prefers a local Natural / Neural voice", () => {
    const natural = chrome("Microsoft Jenny (Natural) - English (United States)", "en-US");
    const david = chrome("Microsoft David - English (United States)", "en-US", { default: true });
    expect(pickEnglishVoice([david, natural])?.name).toBe(natural.name);
  });
});

describe("rankEnglishVoices", () => {
  it("prefers en-US within the same quality", () => {
    const voices = [chrome("Karen", "en-AU"), chrome("Samantha", "en-US")];
    expect(pickEnglishVoice(voices)?.name).toBe("Samantha");
  });

  it("reads underscores and case in the language", () => {
    expect(pickEnglishVoice([chrome("Karen", "EN_au"), chrome("Thomas", "fr-FR")])?.name).toBe(
      "Karen",
    );
  });

  it("never picks a network voice (offline only) nor a non-English one", () => {
    expect(
      pickEnglishVoice([
        chrome("Google US English", "en-US", { localService: false }),
        chrome("Monica", "es-ES"),
      ]),
    ).toBeNull();
    expect(pickEnglishVoice([])).toBeNull();
  });

  it("is deterministic whatever the order the browser lists voices in", () => {
    const shuffled = [...IPHONE].reverse();
    expect(rankEnglishVoices(shuffled)).toEqual(rankEnglishVoices(IPHONE));
    const known = [chrome("Zoe", "en-US"), chrome("Aaron", "en-US"), chrome("Nicky", "en-US")];
    expect(rankEnglishVoices(known).map((v) => v.name)).toEqual(["Nicky", "Zoe", "Aaron"]);
    expect(rankEnglishVoices([...known].reverse()).map((v) => v.name)).toEqual([
      "Nicky",
      "Zoe",
      "Aaron",
    ]);
  });
});

describe("isUsableVoice", () => {
  it("accepts local English voices that are not novelty nor Eloquence", () => {
    expect(isUsableVoice(webkit("Samantha", "com.apple.voice.compact.en-US.Samantha"))).toBe(true);
    expect(isUsableVoice(webkit("Fred", "com.apple.speech.synthesis.voice.Fred"))).toBe(true);
    expect(isUsableVoice(webkit("Albert", "com.apple.speech.synthesis.voice.Albert"))).toBe(false);
    expect(isUsableVoice(webkit("Eddy", "com.apple.eloquence.en-US.Eddy"))).toBe(false);
    expect(isUsableVoice(chrome("Google US English", "en-US", { localService: false }))).toBe(
      false,
    );
    expect(isUsableVoice(chrome("Monica", "es-ES"))).toBe(false);
  });
});
