/** A UUIDv7 string (RFC 9562): lowercase `8-4-4-4-12` hex. */
export type EventId = string;

const MAX_TIMESTAMP_MS = 2 ** 48 - 1;
const RANDOM_BYTES = 10;

/**
 * Builds a UUIDv7 (RFC 9562 §5.7) from an injected clock reading and random source:
 *
 * - bits 0-47: `nowMs` (unix epoch milliseconds), big-endian;
 * - bits 48-51: version `0111`; bits 52-63: `rand_a` (12 random bits);
 * - bits 64-65: variant `10`; bits 66-127: `rand_b` (62 random bits).
 *
 * `random(10)` must return at least 10 bytes (only 74 of their bits are used). Ids from different
 * milliseconds sort lexicographically by time; ids from the same millisecond are ordered only by
 * their random bits (no monotonic counter).
 */
export function uuidv7(nowMs: number, random: (n: number) => Uint8Array): EventId {
  if (!Number.isInteger(nowMs) || nowMs < 0 || nowMs > MAX_TIMESTAMP_MS) {
    throw new RangeError(`Timestamp must be an integer 0..2^48-1 ms, got ${nowMs}`);
  }
  const rand = random(RANDOM_BYTES);
  if (rand.length < RANDOM_BYTES) {
    throw new RangeError(`Random source returned ${rand.length} bytes, need ${RANDOM_BYTES}`);
  }

  const bytes = new Uint8Array(16);
  let ms = nowMs;
  for (let i = 5; i >= 0; i--) {
    bytes[i] = ms % 256;
    ms = Math.floor(ms / 256);
  }
  const r = (i: number) => rand[i] ?? 0;
  bytes[6] = 0x70 | (r(0) & 0x0f);
  bytes[7] = r(1);
  bytes[8] = 0x80 | (r(2) & 0x3f);
  for (let i = 3; i < RANDOM_BYTES; i++) bytes[i + 6] = r(i);

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
