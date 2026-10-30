import { describe, expect, it } from "vitest";
import { findDuplicateKeys } from "./json-keys";

describe("findDuplicateKeys", () => {
  it("returns nothing for JSON without duplicate keys", () => {
    expect(findDuplicateKeys('{"a":1,"b":{"a":[1,{"a":2}]},"c":[]}')).toEqual([]);
    expect(findDuplicateKeys("[1, true, null, -2.5e3]")).toEqual([]);
  });
  it("reports nested and root duplicates in document order with readable paths", () => {
    expect(findDuplicateKeys('{"a":1,"b":{"c":1,"c":2},"a":3}')).toEqual([
      { path: "b.c", key: "c" },
      { path: "a", key: "a" },
    ]);
  });
  it("tracks array indexes", () => {
    expect(findDuplicateKeys('{"items":[{"x":1},{"x":1, "x":2}]}')).toEqual([
      { path: "items[1].x", key: "x" },
    ]);
  });
  it("is not fooled by structural characters or escapes inside strings", () => {
    const text = '{"k":"\\"}{,:[","k2":"\\\\","k2":0, "o": {"k":"k"}}';
    expect(JSON.parse(text)).toBeTypeOf("object");
    expect(findDuplicateKeys(text)).toEqual([{ path: "k2", key: "k2" }]);
  });
  it("compares decoded keys", () => {
    expect(findDuplicateKeys('{"\\u0061":1,"a":2}')).toEqual([{ path: "a", key: "a" }]);
  });
  it("handles whitespace and newlines between tokens", () => {
    expect(findDuplicateKeys('{\n  "a" : 1 ,\n  "a"\t:\n 2\n}\n')).toEqual([{ path: "a", key: "a" }]);
  });
});
