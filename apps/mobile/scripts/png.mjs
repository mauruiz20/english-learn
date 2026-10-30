// A tiny PNG codec (8-bit RGB / RGBA, non-interlaced) and an area-averaging downscaler, enough
// to derive the PWA icons from the app icon without an image-processing dependency.
import { deflateSync, inflateSync } from "node:zlib";

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** Decodes an 8-bit RGB or RGBA, non-interlaced PNG into `{ width, height, data }` (RGBA). */
export function decodePng(buffer) {
  if (!SIGNATURE.equals(buffer.subarray(0, 8))) throw new Error("Not a PNG file");
  let offset = 8;
  let header;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        interlace: data[12],
      };
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    offset += 12 + length;
  }
  const { width, height, bitDepth, colorType, interlace } = header;
  if (bitDepth !== 8 || interlace !== 0 || (colorType !== 6 && colorType !== 2)) {
    throw new Error(`Unsupported PNG (bit depth ${bitDepth}, color type ${colorType})`);
  }
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  const pixels = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? pixels[y * stride + x - channels] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upLeft = y > 0 && x >= channels ? pixels[(y - 1) * stride + x - channels] : 0;
      const predictor = [0, left, up, (left + up) >> 1, paeth(left, up, upLeft)][filter];
      if (predictor === undefined) throw new Error(`Unknown PNG filter ${filter}`);
      pixels[y * stride + x] = (line[x] + predictor) & 0xff;
    }
  }
  if (channels === 4) return { width, height, data: pixels };
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data.set(pixels.subarray(i * 3, i * 3 + 3), i * 4);
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

/**
 * Encodes `{ width, height, data }` (RGBA) as an 8-bit RGBA PNG. Each row uses the filter with
 * the smallest sum of absolute residuals (the usual heuristic), which keeps gradients small.
 */
export function encodePng({ width, height, data }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  const candidate = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    let best = Infinity;
    for (let filter = 0; filter < 5; filter++) {
      let cost = 0;
      for (let x = 0; x < stride; x++) {
        const left = x >= 4 ? data[y * stride + x - 4] : 0;
        const up = y > 0 ? data[(y - 1) * stride + x] : 0;
        const upLeft = y > 0 && x >= 4 ? data[(y - 1) * stride + x - 4] : 0;
        const predictor = [0, left, up, (left + up) >> 1, paeth(left, up, upLeft)][filter];
        candidate[x] = (data[y * stride + x] - predictor) & 0xff;
        cost += candidate[x] < 128 ? candidate[x] : 256 - candidate[x];
      }
      if (cost < best) {
        best = cost;
        raw[y * (stride + 1)] = filter;
        raw.set(candidate, y * (stride + 1) + 1);
      }
    }
  }
  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * Downscales by averaging every source pixel each target pixel covers (weighted by coverage),
 * which keeps edges smooth without ringing. Colors are averaged premultiplied by alpha.
 */
export function resize(source, width, height) {
  const scaleX = source.width / width;
  const scaleY = source.height / height;
  const data = new Uint8Array(width * height * 4);
  for (let ty = 0; ty < height; ty++) {
    const y0 = ty * scaleY;
    const y1 = y0 + scaleY;
    for (let tx = 0; tx < width; tx++) {
      const x0 = tx * scaleX;
      const x1 = x0 + scaleX;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let area = 0;
      for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy++) {
        const wy = Math.min(sy + 1, y1) - Math.max(sy, y0);
        for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx++) {
          const w = wy * (Math.min(sx + 1, x1) - Math.max(sx, x0));
          const i = (sy * source.width + sx) * 4;
          const alpha = source.data[i + 3] * w;
          r += source.data[i] * alpha;
          g += source.data[i + 1] * alpha;
          b += source.data[i + 2] * alpha;
          a += alpha;
          area += w;
        }
      }
      const o = (ty * width + tx) * 4;
      if (a > 0) {
        data[o] = Math.round(r / a);
        data[o + 1] = Math.round(g / a);
        data[o + 2] = Math.round(b / a);
      }
      data[o + 3] = Math.round(a / area);
    }
  }
  return { width, height, data };
}

/** Composites the image over an opaque `[r, g, b]` background (home screen icons are opaque). */
export function flatten(source, [br, bg, bb]) {
  const data = new Uint8Array(source.data.length);
  for (let i = 0; i < data.length; i += 4) {
    const alpha = source.data[i + 3] / 255;
    data[i] = Math.round(source.data[i] * alpha + br * (1 - alpha));
    data[i + 1] = Math.round(source.data[i + 1] * alpha + bg * (1 - alpha));
    data[i + 2] = Math.round(source.data[i + 2] * alpha + bb * (1 - alpha));
    data[i + 3] = 255;
  }
  return { width: source.width, height: source.height, data };
}
