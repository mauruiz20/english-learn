#!/usr/bin/env node
// Synthesizes the app's interaction sounds into assets/sounds/*.wav (16-bit PCM mono, 44.1 kHz).
// Pure JS, no dependencies, deterministic: the same code always writes the same bytes, so the
// committed files can be regenerated and diffed. Usage: node scripts/generate-sounds.mjs
//
// Each sound is a few notes. A note is a soft "mallet" voice: a sine with a little 2nd and 3rd
// harmonic, doubled by a copy detuned a few cents (warmth, no beeping), shaped by an
// attack / exponential decay envelope. The mix is faded out at the end and its peak normalized
// to -6 dBFS.
import { Buffer } from "node:buffer";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const SAMPLE_RATE = 44_100;
const PEAK_DBFS = -6;
const END_FADE_S = 0.012;

/** Equal-tempered frequency of a MIDI note (69 = A4 = 440 Hz). */
const midi = (n) => 440 * 2 ** ((n - 69) / 12);

/**
 * @typedef {{ at: number, freq: number, length: number, attack?: number, decay: number,
 *   gain?: number, harmonics?: readonly number[], detuneCents?: number, glide?: number,
 *   partials?: readonly [ratio: number, gain: number][] }} Note
 * `at`, `length`, `attack`, `decay` in seconds; `decay` is the exponential time constant;
 * `harmonics` are the gains of partials 2, 3, …; `glide` multiplies the pitch over the note
 * (e.g. 0.9 slides down a little); `partials` adds inharmonic [ratio, gain] pairs (sparkle).
 */

/** @type {Readonly<Record<string, { duration: number, notes: readonly Note[] }>>} */
export const SOUNDS = {
  // A very soft wooden tick when choosing an option or a word.
  tap: {
    duration: 0.07,
    notes: [{ at: 0, freq: 1320, length: 0.07, attack: 0.002, decay: 0.012, harmonics: [0.3] }],
  },
  // Any other button: a paper "tick", like a sticker pressed onto the page. Shorter, duller and
  // lower than the tap (a soft top note that drops a little over a muted body), 45 ms, ~4 KB.
  press: {
    duration: 0.045,
    notes: [
      {
        at: 0,
        freq: 1760,
        length: 0.045,
        attack: 0.0015,
        decay: 0.006,
        harmonics: [0.12],
        glide: 0.9,
      },
      { at: 0, freq: 620, length: 0.045, attack: 0.002, decay: 0.009, gain: 0.45 },
    ],
  },
  // Bright and short: a rising fifth (C6 → G6).
  correct: {
    duration: 0.36,
    notes: [
      { at: 0, freq: midi(84), length: 0.2, decay: 0.07, harmonics: [0.2, 0.06] },
      { at: 0.085, freq: midi(91), length: 0.27, decay: 0.1, harmonics: [0.2, 0.06] },
    ],
  },
  // Gentle "nearly": two notes, the second a step lower (E5 → D5).
  almost: {
    duration: 0.36,
    notes: [
      { at: 0, freq: midi(76), length: 0.18, attack: 0.008, decay: 0.07, harmonics: [0.12] },
      { at: 0.11, freq: midi(74), length: 0.25, attack: 0.008, decay: 0.09, harmonics: [0.12] },
    ],
  },
  // A soft, low, muted tone that sinks a little. Not a buzzer: almost no harmonics.
  wrong: {
    duration: 0.32,
    notes: [
      {
        at: 0,
        freq: midi(57),
        length: 0.32,
        attack: 0.018,
        decay: 0.11,
        harmonics: [0.15],
        glide: 0.94,
      },
    ],
  },
  // Lesson / review / placement done: a quick major arpeggio (C5 E5 G5 C6) that rings out.
  complete: {
    duration: 0.85,
    notes: [72, 76, 79, 84].map((n, i) => ({
      at: i * 0.09,
      freq: midi(n),
      length: 0.85 - i * 0.09,
      decay: i === 3 ? 0.22 : 0.14,
      gain: i === 3 ? 1 : 0.8,
      harmonics: [0.18, 0.05],
    })),
  },
  // The streak went up: two high bell-like notes (E6 → B6) with a little shimmer.
  streak: {
    duration: 0.4,
    notes: [
      {
        at: 0,
        freq: midi(88),
        length: 0.22,
        decay: 0.07,
        harmonics: [0.1],
        partials: [[2.76, 0.12]],
      },
      {
        at: 0.1,
        freq: midi(95),
        length: 0.3,
        decay: 0.1,
        harmonics: [0.1],
        partials: [[2.76, 0.12]],
      },
    ],
  },
  // A sticker for the album: a rising major sixth chord rolled like a glockenspiel
  // (G5 B5 D6 → G6 E7 shimmer), brighter than "complete" and over sooner.
  achievement: {
    duration: 0.8,
    notes: [79, 83, 86, 91, 100].map((n, i) => ({
      at: i * 0.07,
      freq: midi(n),
      length: 0.8 - i * 0.07,
      decay: i === 4 ? 0.2 : 0.12,
      gain: i === 4 ? 0.55 : 0.85,
      harmonics: [0.08],
      partials: [[2.76, i >= 3 ? 0.14 : 0.06]],
    })),
  },
};

/** Renders one note into `out` (float samples), mixing. */
function renderNote(out, note) {
  const {
    at,
    freq,
    length,
    attack = 0.004,
    decay,
    gain = 1,
    harmonics = [],
    detuneCents = 4,
    glide = 1,
    partials = [],
  } = note;
  const start = Math.round(at * SAMPLE_RATE);
  const count = Math.min(Math.round(length * SAMPLE_RATE), out.length - start);
  const detune = 2 ** (detuneCents / 1200);
  // [frequency ratio, gain] of every partial, the detuned copy at half gain.
  const voices = [[1, 1], ...harmonics.map((g, i) => [i + 2, g]), ...partials].flatMap(
    ([ratio, g]) => [
      [ratio, g],
      [ratio * detune, g * 0.5],
    ],
  );
  const phases = voices.map(() => 0);
  for (let i = 0; i < count; i++) {
    const t = i / SAMPLE_RATE;
    const progress = i / count;
    const pitch = freq * (1 + (glide - 1) * progress);
    const envelope = t < attack ? t / attack : Math.exp(-(t - attack) / decay);
    // Each note fades to zero over its last few ms so it never clicks off.
    const tail = Math.min(1, (count - i) / (END_FADE_S * SAMPLE_RATE));
    let sample = 0;
    voices.forEach(([ratio, g], v) => {
      phases[v] += (2 * Math.PI * pitch * ratio) / SAMPLE_RATE;
      sample += g * Math.sin(phases[v]);
    });
    out[start + i] += gain * envelope * tail * sample;
  }
}

/** The sound as float samples, peak-normalized to PEAK_DBFS. */
export function renderSamples(name) {
  const sound = SOUNDS[name];
  if (sound === undefined) throw new Error(`Unknown sound "${name}"`);
  const out = new Float64Array(Math.round(sound.duration * SAMPLE_RATE));
  for (const note of sound.notes) renderNote(out, note);
  const peak = out.reduce((max, s) => Math.max(max, Math.abs(s)), 0);
  const scale = peak === 0 ? 0 : 10 ** (PEAK_DBFS / 20) / peak;
  return out.map((s) => s * scale);
}

/** The sound as a canonical 16-bit PCM mono WAV file. */
export function renderWav(name) {
  const samples = renderSamples(name);
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16); // fmt chunk size
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate
  buffer.writeUInt16LE(2, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);
  samples.forEach((s, i) => {
    const clamped = Math.max(-1, Math.min(1, s));
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  });
  return buffer;
}

function main() {
  const outDir = resolve(dirname(fileURLToPath(import.meta.url)), "../assets/sounds");
  mkdirSync(outDir, { recursive: true });
  for (const name of Object.keys(SOUNDS)) {
    const wav = renderWav(name);
    writeFileSync(join(outDir, `${name}.wav`), wav);
    const ms = Math.round(((wav.length - 44) / 2 / SAMPLE_RATE) * 1000);
    console.log(`${name}.wav  ${ms} ms  ${wav.length} bytes`);
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
