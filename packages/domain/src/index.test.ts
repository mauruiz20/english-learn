import { describe, expect, it } from "vitest";
import { DOMAIN_NAME } from "./index";

describe("domain", () => {
  it("exposes its package name", () => {
    expect(DOMAIN_NAME).toBe("@english-learn/domain");
  });
});
