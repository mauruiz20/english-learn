/* global jest */
// Runs in every test file before its tests: the mocks Reanimated, Worklets and Gesture Handler
// ship for Jest. Under the Reanimated mock every animation lands on its end value at once, so
// tests assert what the learner ends up seeing (the end state), never intermediate frames.
jest.mock("react-native-worklets", () => require("react-native-worklets/lib/module/mock"));
jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));
require("react-native-gesture-handler/jestSetup");
