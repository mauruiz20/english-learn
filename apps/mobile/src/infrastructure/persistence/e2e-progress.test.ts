import { rebuildRequested } from "./e2e-progress";

describe("rebuildRequested", () => {
  it.each([
    ["?rebuildProgress=1", true],
    ["?today=2030-01-01&rebuildProgress=1", true],
    ["", false],
    ["?rebuildProgress=0", false],
    ["?rebuildProgress", false],
  ])("%j → %s", (search, expected) => {
    expect(rebuildRequested(search)).toBe(expected);
  });
});
