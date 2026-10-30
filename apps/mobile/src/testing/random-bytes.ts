import type { RandomBytes } from "@/features/progress/progress-events";

/** Deterministic `RandomBytes` for tests: every call returns new bytes from a counter. */
export function createTestRandomBytes(): RandomBytes {
  let counter = 0;
  return (n) => {
    counter += 1;
    const bytes = new Uint8Array(n);
    let value = counter;
    for (let i = n - 1; i >= 0 && value > 0; i--) {
      bytes[i] = value % 256;
      value = Math.floor(value / 256);
    }
    return bytes;
  };
}

/** Shared instance for `AppServices` fakes. */
export const testRandomBytes: RandomBytes = createTestRandomBytes();
