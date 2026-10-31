/* global jest */
// Runs in every test file before its tests: the mocks Reanimated, Worklets and Gesture Handler
// ship for Jest. Under the Reanimated mock every animation lands on its end value at once.
//
// Reduced motion defaults to ON in tests (`globalThis.__TEST_REDUCED_MOTION__`, reset before each
// test by jest.after-env.js), so every screen renders its end state right away; a test about
// motion opts out with `withMotion()` from src/testing/motion.ts.
globalThis.__TEST_REDUCED_MOTION__ = true;
jest.mock("react-native-worklets", () => require("react-native-worklets/lib/module/mock"));
// Reanimated 4.7 runs native-only setup when it loads (CSS event handler, UI-runtime globals);
// under the Worklets mock there is no UI runtime, so that setup is skipped.
jest.mock("react-native-reanimated/src/initializers", () => ({
  initializeReanimatedModule: () => {},
}));
jest.mock("react-native-reanimated", () => ({
  ...require("react-native-reanimated/mock"),
  useReducedMotion: () => globalThis.__TEST_REDUCED_MOTION__,
}));
require("react-native-gesture-handler/jestSetup");
