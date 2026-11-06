import { pickEnglishVoice, splitForSpeech, type VoiceLike } from "./voice-choice";
import { createWebSpeechService, type SynthLike, type UtteranceLike } from "./web-speech-service";

function voice(
  name: string,
  lang: string,
  extra: Partial<Omit<VoiceLike, "name" | "lang">> = {},
): VoiceLike {
  return { name, lang, localService: true, default: false, voiceURI: name, ...extra };
}

type Listener = () => void;

/** A fake `speechSynthesis`: records what it is asked to say and lets the test end utterances. */
function fakeSynth(initialVoices: VoiceLike[] = []) {
  let voices = initialVoices;
  const listeners = new Set<Listener>();
  const queue: UtteranceLike[] = [];
  const spoken: UtteranceLike[] = [];
  const synth = {
    speaking: false,
    pending: false,
    paused: false,
    cancels: 0,
    resumes: 0,
    getVoices: () => voices,
    speak(utterance: UtteranceLike) {
      spoken.push(utterance);
      queue.push(utterance);
      synth.speaking = true;
    },
    cancel() {
      synth.cancels += 1;
      const dropped = queue.splice(0);
      synth.speaking = false;
      for (const u of dropped) u.onerror?.({ error: "interrupted" });
    },
    resume() {
      synth.resumes += 1;
      synth.paused = false;
    },
    addEventListener(type: string, listener: Listener) {
      if (type === "voiceschanged") listeners.add(listener);
    },
    removeEventListener(type: string, listener: Listener) {
      if (type === "voiceschanged") listeners.delete(listener);
    },
  };
  return {
    synth: synth as typeof synth & SynthLike,
    spoken,
    /** Ends the utterance being spoken (the first in the queue). */
    finishOne() {
      const u = queue.shift();
      synth.speaking = queue.length > 0;
      u?.onend?.({});
    },
    loadVoices(next: VoiceLike[]) {
      voices = next;
      for (const l of [...listeners]) l();
    },
    setVoicesSilently(next: VoiceLike[]) {
      voices = next;
    },
  };
}

function fakeUtterance(text: string): UtteranceLike {
  return {
    text,
    lang: "",
    voice: null,
    rate: 1,
    pitch: 1,
    volume: 1,
    onstart: null,
    onend: null,
    onerror: null,
  };
}

/** Event targets for `document` / `window` with dispatch. */
function fakeTarget(extra: Record<string, unknown> = {}) {
  const listeners = new Map<string, Set<Listener>>();
  return {
    ...extra,
    addEventListener(type: string, listener: Listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)?.add(listener);
    },
    removeEventListener(type: string, listener: Listener) {
      listeners.get(type)?.delete(listener);
    },
    dispatch(type: string) {
      for (const l of [...(listeners.get(type) ?? [])]) l();
    },
    count(type: string) {
      return listeners.get(type)?.size ?? 0;
    },
  };
}

function fakeTimers() {
  let now = 0;
  let nextId = 1;
  const pending = new Map<number, { at: number; run: () => void }>();
  return {
    setTimeout: (run: () => void, ms: number) => {
      const id = nextId++;
      pending.set(id, { at: now + ms, run });
      return id;
    },
    clearTimeout: (id: unknown) => {
      pending.delete(id as number);
    },
    advance(ms: number) {
      now += ms;
      for (const [id, timer] of [...pending].sort((a, b) => a[1].at - b[1].at)) {
        if (timer.at <= now) {
          pending.delete(id);
          timer.run();
        }
      }
    },
  };
}

function setup(voices: VoiceLike[] = [voice("Samantha", "en-US")]) {
  const fake = fakeSynth(voices);
  const doc = fakeTarget({ hidden: false });
  const win = fakeTarget();
  const timers = fakeTimers();
  const service = createWebSpeechService({
    synth: fake.synth,
    createUtterance: fakeUtterance,
    document: doc,
    window: win,
    timers,
  });
  return { ...fake, doc, win, timers, service };
}

describe("pickEnglishVoice", () => {
  it("prefers a local en-US voice over others", () => {
    const chosen = pickEnglishVoice([
      voice("Monica", "es-ES"),
      voice("Daniel", "en-GB"),
      voice("Samantha", "en-US"),
      voice("Google US English", "en-US", { localService: false }),
    ]);
    expect(chosen?.name).toBe("Samantha");
  });

  it("prefers a higher quality voice among the same language", () => {
    const chosen = pickEnglishVoice([
      voice("Alex", "en-US"),
      voice("Ava (Premium)", "en-US"),
      voice("Fred", "en-US", { default: true }),
    ]);
    expect(chosen?.name).toBe("Ava (Premium)");
  });

  it("falls back to another English variant, and reads underscores and case", () => {
    expect(pickEnglishVoice([voice("Karen", "EN_au"), voice("Thomas", "fr-FR")])?.name).toBe(
      "Karen",
    );
  });

  it("never picks a network voice (offline only) nor a non-English one", () => {
    expect(
      pickEnglishVoice([
        voice("Google US English", "en-US", { localService: false }),
        voice("Monica", "es-ES"),
      ]),
    ).toBeNull();
    expect(pickEnglishVoice([])).toBeNull();
  });

  it("is deterministic whatever the order the browser lists voices in", () => {
    const voices = [voice("Zoe", "en-US"), voice("Aaron", "en-US"), voice("Nicky", "en-US")];
    expect(pickEnglishVoice(voices)?.name).toBe("Aaron");
    expect(pickEnglishVoice([...voices].reverse())?.name).toBe("Aaron");
  });
});

describe("splitForSpeech", () => {
  it("keeps a short text whole and splits a long one at sentence ends", () => {
    expect(splitForSpeech("  I get up at six.  ")).toEqual(["I get up at six."]);
    const long = "One two three four. ".repeat(12).trim();
    const chunks = splitForSpeech(long, 60);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join(" ")).toBe(long);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(60);
  });

  it("returns nothing for blank text", () => {
    expect(splitForSpeech("   ")).toEqual([]);
  });
});

describe("createWebSpeechService", () => {
  it("is available with an English voice and speaks with it at the given rate", () => {
    const { service, spoken } = setup();
    expect(service.getSnapshot().available).toBe(true);

    service.speak("I get up at six.", { rate: 0.7, key: "a" });

    expect(spoken).toHaveLength(1);
    expect(spoken[0]).toMatchObject({ text: "I get up at six.", rate: 0.7, lang: "en-US" });
    expect(spoken[0]?.voice?.name).toBe("Samantha");
    expect(service.getSnapshot().speakingKey).toBe("a");
  });

  it("cancels what is being said before speaking again, and ignores the old utterance's end", () => {
    const { service, synth, spoken, finishOne } = setup();
    service.speak("First.", { rate: 1, key: "a" });
    const cancelsBefore = synth.cancels;

    service.speak("Second.", { rate: 1, key: "b" });

    expect(synth.cancels).toBe(cancelsBefore + 1);
    expect(spoken.map((u) => u.text)).toEqual(["First.", "Second."]);
    // The first utterance was interrupted: the speaking state belongs to the second.
    expect(service.getSnapshot().speakingKey).toBe("b");
    finishOne();
    expect(service.getSnapshot().speakingKey).toBeNull();
  });

  it("cancel() stops speaking and notifies listeners", () => {
    const { service } = setup();
    const listener = jest.fn();
    const unsubscribe = service.subscribe(listener);
    service.speak("Hello.", { rate: 1, key: "a" });
    service.cancel();
    expect(service.getSnapshot().speakingKey).toBeNull();
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it("speaks a long text as queued chunks and ends after the last one", () => {
    const { service, spoken, finishOne } = setup();
    const text = "This is a sentence that goes on. ".repeat(10).trim();
    service.speak(text, { rate: 1, key: "passage" });
    expect(spoken.length).toBeGreaterThan(1);
    for (let i = 0; i < spoken.length - 1; i++) {
      finishOne();
      expect(service.getSnapshot().speakingKey).toBe("passage");
    }
    finishOne();
    expect(service.getSnapshot().speakingKey).toBeNull();
  });

  it("resumes a paused engine before speaking (WebKit can get stuck paused)", () => {
    const { service, synth } = setup();
    synth.paused = true;
    service.speak("Hello.", { rate: 1, key: "a" });
    expect(synth.resumes).toBe(1);
  });

  it("is unavailable without speechSynthesis, and speaking then does nothing", () => {
    const service = createWebSpeechService({
      synth: undefined,
      createUtterance: fakeUtterance,
      timers: fakeTimers(),
    });
    expect(service.getSnapshot()).toEqual({ available: false, speakingKey: null });
    expect(() => service.speak("Hello.", { rate: 1, key: "a" })).not.toThrow();
    expect(service.getSnapshot().speakingKey).toBeNull();
  });

  it("is unavailable when no English voice exists", () => {
    const { service, spoken } = setup([voice("Monica", "es-ES")]);
    expect(service.getSnapshot().available).toBe(false);
    service.speak("Hello.", { rate: 1, key: "a" });
    expect(spoken).toHaveLength(0);
  });

  it("becomes available when the voices load later (voiceschanged)", () => {
    const { service, loadVoices } = setup([]);
    const listener = jest.fn();
    service.subscribe(listener);
    expect(service.getSnapshot().available).toBe(false);

    loadVoices([voice("Samantha", "en-US")]);

    expect(service.getSnapshot().available).toBe(true);
    expect(listener).toHaveBeenCalled();
  });

  it("checks again on a timer when voiceschanged never fires (iOS)", () => {
    const { service, setVoicesSilently, timers } = setup([]);
    setVoicesSilently([voice("Samantha", "en-US")]);
    expect(service.getSnapshot().available).toBe(false);
    timers.advance(1_000);
    expect(service.getSnapshot().available).toBe(true);
  });

  it("primes the engine on the first tap with a silent utterance, then reads the voices", () => {
    const { service, spoken, setVoicesSilently, doc, timers } = setup([]);
    setVoicesSilently([voice("Samantha", "en-US")]);

    doc.dispatch("pointerdown");

    expect(spoken).toHaveLength(1);
    expect(spoken[0]).toMatchObject({ text: "", volume: 0 });
    timers.advance(100);
    expect(service.getSnapshot().available).toBe(true);
    // Only once.
    doc.dispatch("pointerdown");
    expect(spoken).toHaveLength(1);
    expect(doc.count("pointerdown")).toBe(0);
  });

  it("stops speaking when the page goes to the background (iOS cuts it off without an end)", () => {
    const { service, synth, doc } = setup();
    service.speak("Hello there.", { rate: 1, key: "a" });
    const cancels = synth.cancels;
    (doc as unknown as { hidden: boolean }).hidden = true;
    doc.dispatch("visibilitychange");
    expect(synth.cancels).toBe(cancels + 1);
    expect(service.getSnapshot().speakingKey).toBeNull();
  });

  it("clears a speaking state whose end never comes (watchdog)", () => {
    const { service, timers } = setup();
    service.speak("Hello.", { rate: 1, key: "a" });
    timers.advance(60_000);
    expect(service.getSnapshot().speakingKey).toBeNull();
  });

  it("never throws when the engine does", () => {
    const { service, synth } = setup();
    synth.speak = () => {
      throw new Error("boom");
    };
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => service.speak("Hello.", { rate: 1, key: "a" })).not.toThrow();
    expect(service.getSnapshot().speakingKey).toBeNull();
    warn.mockRestore();
  });
});
