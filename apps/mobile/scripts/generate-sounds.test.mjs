// Tests for the sound generator (Node's built-in test runner: `node --test scripts/`).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SAMPLE_RATE, SOUNDS, renderWav } from "./generate-sounds.mjs";

const NAMES = ["tap", "correct", "almost", "wrong", "complete", "streak"];

/** Parses a canonical 44-byte-header PCM WAV. */
function parseWav(buffer) {
  return {
    riff: buffer.toString("ascii", 0, 4),
    riffSize: buffer.readUInt32LE(4),
    wave: buffer.toString("ascii", 8, 12),
    fmt: buffer.toString("ascii", 12, 16),
    audioFormat: buffer.readUInt16LE(20),
    channels: buffer.readUInt16LE(22),
    sampleRate: buffer.readUInt32LE(24),
    byteRate: buffer.readUInt32LE(28),
    bitsPerSample: buffer.readUInt16LE(34),
    data: buffer.toString("ascii", 36, 40),
    dataSize: buffer.readUInt32LE(40),
    samples: Array.from({ length: (buffer.length - 44) / 2 }, (_, i) =>
      buffer.readInt16LE(44 + i * 2),
    ),
  };
}

describe("generate-sounds", () => {
  it("defines exactly the app's six sounds", () => {
    assert.deepEqual(Object.keys(SOUNDS).sort(), [...NAMES].sort());
  });

  for (const name of NAMES) {
    describe(name, () => {
      const buffer = renderWav(name);
      const wav = parseWav(buffer);

      it("is a 16-bit PCM mono RIFF/WAVE at 44.1 kHz", () => {
        assert.equal(wav.riff, "RIFF");
        assert.equal(wav.wave, "WAVE");
        assert.equal(wav.fmt, "fmt ");
        assert.equal(wav.data, "data");
        assert.equal(wav.audioFormat, 1);
        assert.equal(wav.channels, 1);
        assert.equal(wav.bitsPerSample, 16);
        assert.equal(wav.sampleRate, SAMPLE_RATE);
        assert.equal(SAMPLE_RATE, 44_100);
        assert.equal(wav.byteRate, SAMPLE_RATE * 2);
        assert.equal(wav.dataSize, buffer.length - 44);
        assert.equal(wav.riffSize, buffer.length - 8);
      });

      it("is short", () => {
        const ms = (wav.samples.length / SAMPLE_RATE) * 1000;
        const max = name === "complete" ? 900 : 400;
        assert.ok(ms > 30 && ms <= max, `${name} lasts ${ms} ms (max ${max})`);
      });

      it("peaks around -6 dBFS", () => {
        const peak = Math.max(...wav.samples.map(Math.abs)) / 32768;
        const dbfs = 20 * Math.log10(peak);
        assert.ok(dbfs > -6.5 && dbfs < -5.5, `${name} peaks at ${dbfs.toFixed(2)} dBFS`);
      });

      it("starts and ends in silence (no clicks)", () => {
        assert.ok(Math.abs(wav.samples[0]) < 50);
        assert.ok(Math.abs(wav.samples[wav.samples.length - 1]) < 50);
      });

      it("is deterministic", () => {
        assert.ok(renderWav(name).equals(buffer));
      });
    });
  }
});
