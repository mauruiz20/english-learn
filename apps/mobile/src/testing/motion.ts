/**
 * Tests run with reduced motion ON by default (end states at once; see jest.setup.js). Call this
 * at the start of a test about motion to turn it off for that test.
 */
export function withMotion() {
  (globalThis as { __TEST_REDUCED_MOTION__?: boolean }).__TEST_REDUCED_MOTION__ = false;
}
