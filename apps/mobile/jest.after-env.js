/* global jest, beforeEach */
// Runs in every test file after the test framework is installed (see jest.setup.js).
const { AccessibilityInfo } = require("react-native");

beforeEach(() => {
  globalThis.__TEST_REDUCED_MOTION__ = true;
  jest
    .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
    .mockImplementation(() => Promise.resolve(globalThis.__TEST_REDUCED_MOTION__));
});
