// Tests for the tiny PNG codec used to generate the PWA icons (`node --test scripts/`).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { decodePng, encodePng, flatten, resize } from "./png.mjs";

function image(width, height, pixel) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data.set(pixel(x, y), (y * width + x) * 4);
  }
  return { width, height, data };
}

describe("png", () => {
  it("round-trips an RGBA image through encode and decode", () => {
    const original = image(3, 2, (x, y) => [x * 80, y * 120, 7, 255 - x]);
    const decoded = decodePng(encodePng(original));
    assert.equal(decoded.width, 3);
    assert.equal(decoded.height, 2);
    assert.deepEqual([...decoded.data], [...original.data]);
  });

  it("writes a valid PNG signature and IHDR (8-bit RGBA)", () => {
    const png = encodePng(image(5, 4, () => [0, 0, 0, 255]));
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(png.toString("ascii", 12, 16), "IHDR");
    assert.equal(png.readUInt32BE(16), 5);
    assert.equal(png.readUInt32BE(20), 4);
    assert.equal(png[24], 8);
    assert.equal(png[25], 6);
  });

  it("decodes the app icon (every PNG filter type the encoder of that file used)", async () => {
    const icon = decodePng(await readFile(new URL("../assets/images/icon.png", import.meta.url)));
    assert.equal(icon.width, 1024);
    assert.equal(icon.height, 1024);
    assert.equal(icon.data.length, 1024 * 1024 * 4);
    const pixel = (x, y) => [...icon.data.subarray((y * 1024 + x) * 4, (y * 1024 + x) * 4 + 4)];
    // The bar of the "e" in ink, the paper inside its loop, the highlighter under it.
    assert.deepEqual(pixel(512, 556), [30, 58, 138, 255]);
    assert.deepEqual(pixel(512, 512), [247, 249, 252, 255]);
    assert.deepEqual(pixel(512, 700), [255, 225, 53, 255]);
  });

  it("downscales by averaging the covered source area", () => {
    // 4×4 with four flat 2×2 quadrants → 2×2 with exactly those colors.
    const quadrants = image(4, 4, (x, y) =>
      x < 2 ? (y < 2 ? [255, 0, 0, 255] : [0, 0, 255, 255]) : [0, 255, 0, 255],
    );
    const small = resize(quadrants, 2, 2);
    assert.deepEqual(
      [...small.data],
      [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 0, 255, 0, 255],
    );
  });

  it("downscales by non-integer ratios without losing a flat color", () => {
    const flat = image(7, 7, () => [10, 20, 30, 255]);
    const small = resize(flat, 3, 3);
    assert.equal(small.width, 3);
    for (let i = 0; i < small.data.length; i += 4) {
      assert.deepEqual([...small.data.subarray(i, i + 4)], [10, 20, 30, 255]);
    }
  });

  it("flattens translucent pixels onto an opaque background", () => {
    const translucent = image(2, 1, (x) => (x === 0 ? [200, 100, 0, 128] : [0, 0, 0, 0]));
    const flat = flatten(translucent, [0, 0, 255]);
    assert.deepEqual([...flat.data], [100, 50, 127, 255, 0, 0, 255, 255]);
  });
});
