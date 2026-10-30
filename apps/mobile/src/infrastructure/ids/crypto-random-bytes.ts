import { getRandomValues } from "expo-crypto";
import type { RandomBytes } from "@/features/progress/progress-events";

/**
 * Cryptographically secure random bytes on every platform: expo-crypto's `getRandomValues`
 * (native module on iOS/Android, Web Crypto on web).
 */
export const cryptoRandomBytes: RandomBytes = (n) => getRandomValues(new Uint8Array(n));
