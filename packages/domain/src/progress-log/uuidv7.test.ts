import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { uuidv7 } from "./uuidv7";

const zeros = (n: number) => new Uint8Array(n);
const ones = (n: number) => new Uint8Array(n).fill(0xff);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_MS = 2 ** 48 - 1;

describe("uuidv7 (RFC 9562)", () => {
  it("encodes the 48-bit unix ms timestamp big-endian in the first 12 hex digits", () => {
    expect(uuidv7(0x0123_4567_89ab, zeros)).toBe("01234567-89ab-7000-8000-000000000000");
  });

  it("sets version 7 and variant 10 regardless of the random bytes", () => {
    expect(uuidv7(MAX_MS, ones)).toBe("ffffffff-ffff-7fff-bfff-ffffffffffff");
  });

  it("asks for 10 random bytes and places 74 of their bits after the version and variant", () => {
    const requested: number[] = [];
    const id = uuidv7(1, (n) => {
      requested.push(n);
      return Uint8Array.from({ length: n }, (_, i) => i + 1);
    });
    expect(requested).toEqual([10]);
    // rand_a = low nibble of 0x01, then 0x02; variant bits replace the top 2 bits of 0x03.
    expect(id).toBe("00000000-0001-7102-8304-05060708090a");
  });

  it("is a lowercase 8-4-4-4-12 string with version and variant bits for any input", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: MAX_MS }),
        fc.uint8Array({ minLength: 10, maxLength: 10 }),
        (ms, bytes) => {
          const id = uuidv7(ms, () => bytes);
          expect(id).toMatch(UUID);
          expect(id[14]).toBe("7");
          expect(["8", "9", "a", "b"]).toContain(id[19]);
          expect(parseInt(id.replaceAll("-", "").slice(0, 12), 16)).toBe(ms);
        },
      ),
    );
  });

  it("sorts lexicographically by time across different milliseconds", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: MAX_MS - 1 }),
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.uint8Array({ minLength: 10, maxLength: 10 }),
        fc.uint8Array({ minLength: 10, maxLength: 10 }),
        (ms, delta, a, b) => {
          const later = Math.min(MAX_MS, ms + delta);
          expect(uuidv7(ms, () => a) < uuidv7(later, () => b)).toBe(true);
        },
      ),
    );
  });

  it.each([-1, 1.5, Number.NaN, 2 ** 48])("rejects timestamp %f", (ms) => {
    expect(() => uuidv7(ms, zeros)).toThrow(RangeError);
  });

  it("rejects a random source that returns too few bytes", () => {
    expect(() => uuidv7(0, () => new Uint8Array(9))).toThrow(RangeError);
  });
});
