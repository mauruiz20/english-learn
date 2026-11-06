// A fake `window.speechSynthesis` for e2e specs, installed before the app starts. Browsers in
// CI have different voices (or none), so pronunciation specs stub the engine and read what the
// app asked it to say from `window.__speech.spoken`. Test-only.
import type { Page } from "@playwright/test";

export type StubVoice = { name: string; lang: string; localService?: boolean };

export type SpokenUtterance = {
  text: string;
  lang: string;
  voiceName: string | null;
  rate: number;
  volume: number;
};

const ENGLISH_AND_SPANISH: StubVoice[] = [
  { name: "Test Español", lang: "es-ES" },
  { name: "Test English (network)", lang: "en-US", localService: false },
  { name: "Test English", lang: "en-US" },
];

/**
 * Replaces `speechSynthesis` and `SpeechSynthesisUtterance` on every page of `page`'s context.
 * Voices load late, like WebKit's: `getVoices()` is empty until `voiceschanged` fires 50 ms in.
 * Each utterance "speaks" for 300 ms (start, then end).
 */
export async function stubSpeech(page: Page, voices: StubVoice[] = ENGLISH_AND_SPANISH) {
  await page.addInitScript((stubVoices: StubVoice[]) => {
    type Utterance = {
      text: string;
      lang: string;
      voice: { name: string } | null;
      rate: number;
      pitch: number;
      volume: number;
      onstart: ((e: unknown) => void) | null;
      onend: ((e: unknown) => void) | null;
      onerror: ((e: unknown) => void) | null;
    };
    const host = window as unknown as { __speech: { spoken: unknown[]; cancels: number } };
    host.__speech = { spoken: [], cancels: 0 };
    let loaded: unknown[] = [];
    const listeners = new Set<() => void>();
    let queue: Utterance[] = [];
    const synth = {
      speaking: false,
      pending: false,
      paused: false,
      onvoiceschanged: null as (() => void) | null,
      getVoices: () => loaded,
      speak(u: Utterance) {
        host.__speech.spoken.push({
          text: u.text,
          lang: u.lang,
          voiceName: u.voice?.name ?? null,
          rate: u.rate,
          volume: u.volume,
        });
        queue.push(u);
        synth.speaking = true;
        setTimeout(() => u.onstart?.({}), 10);
        setTimeout(() => {
          if (!queue.includes(u)) return;
          queue = queue.filter((q) => q !== u);
          synth.speaking = queue.length > 0;
          u.onend?.({});
        }, 300);
      },
      cancel() {
        host.__speech.cancels += 1;
        const dropped = queue;
        queue = [];
        synth.speaking = false;
        for (const u of dropped) u.onerror?.({ error: "interrupted" });
      },
      pause() {},
      resume() {},
      addEventListener(type: string, listener: () => void) {
        if (type === "voiceschanged") listeners.add(listener);
      },
      removeEventListener(type: string, listener: () => void) {
        listeners.delete(listener);
      },
    };
    class FakeUtterance {
      text: string;
      lang = "";
      voice = null;
      rate = 1;
      pitch = 1;
      volume = 1;
      onstart = null;
      onend = null;
      onerror = null;
      constructor(text: string) {
        this.text = text;
      }
    }
    Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      value: FakeUtterance,
      configurable: true,
      writable: true,
    });
    setTimeout(() => {
      loaded = stubVoices.map((v) => ({
        name: v.name,
        lang: v.lang,
        localService: v.localService ?? true,
        default: false,
        voiceURI: v.name,
      }));
      for (const listener of listeners) listener();
      synth.onvoiceschanged?.();
    }, 50);
  }, voices);
}

/** What the app asked the stub to say, oldest first (the silent priming utterance excluded). */
export async function spoken(page: Page): Promise<SpokenUtterance[]> {
  const all = await page.evaluate(
    () => (window as unknown as { __speech?: { spoken: unknown[] } }).__speech?.spoken ?? [],
  );
  return (all as SpokenUtterance[]).filter((u) => u.text !== "");
}
