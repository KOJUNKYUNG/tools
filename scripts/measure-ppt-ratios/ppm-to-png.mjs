// Converts 8-bit binary PPMs (P6) to lossless RGB PNGs, so the measurement
// page and the image tools can read the high-resolution set (browsers do not
// decode PPM). Same pixels, other container: nothing is resampled or reduced.
//
// Run: node scripts/measure-ppt-ratios/ppm-to-png.mjs <ppm folder> <png folder>
// Needs no package: node:zlib deflates the pixels and computes the CRCs.

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { crc32, deflateSync } from "node:zlib";

/** Reads an 8-bit P6 PPM (header comments allowed): its size and RGB pixels. */
function readPpm(bytes) {
  const fields = [];
  let i = 0;
  while (fields.length < 4) {
    while (/\s/.test(String.fromCharCode(bytes[i]))) i++;
    if (bytes[i] === 0x23) {
      while (bytes[i] !== 0x0a) i++; // "#" comment to the end of the line
      continue;
    }
    const start = i;
    while (i < bytes.length && !/\s/.test(String.fromCharCode(bytes[i]))) i++;
    fields.push(String.fromCharCode(...bytes.subarray(start, i)));
  }
  const [magic, width, height, max] = [fields[0], ...fields.slice(1).map(Number)];
  if (magic !== "P6" || max !== 255) throw new Error(`not an 8-bit P6 PPM (${magic}, max ${max})`);
  // One whitespace byte separates the header from the pixels.
  const pixels = bytes.subarray(i + 1, i + 1 + width * height * 3);
  if (pixels.length !== width * height * 3) throw new Error("PPM pixels cut short");
  return { width, height, pixels };
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "latin1");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

const paeth = (a, b, c) => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** An RGB PNG of `pixels` (rows of width × 3 bytes), every row Paeth-filtered. */
function encodePng(width, height, pixels) {
  const stride = width * 3;
  const filtered = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    const out = y * (stride + 1);
    filtered[out] = 4; // Paeth
    for (let x = 0; x < stride; x++) {
      const a = x >= 3 ? pixels[row + x - 3] : 0;
      const b = y > 0 ? pixels[row - stride + x] : 0;
      const c = x >= 3 && y > 0 ? pixels[row - stride + x - 3] : 0;
      filtered[out + 1 + x] = (pixels[row + x] - paeth(a, b, c)) & 0xff;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(filtered, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const [from, to] = process.argv.slice(2);
if (!from || !to) throw new Error("usage: ppm-to-png.mjs <ppm folder> <png folder>");
await mkdir(to, { recursive: true });
for (const name of (await readdir(from)).filter((n) => /\.ppm$/i.test(n))) {
  const { width, height, pixels } = readPpm(await readFile(join(from, name)));
  const png = encodePng(width, height, pixels);
  await writeFile(join(to, name.replace(/\.ppm$/i, ".png")), png);
  console.log(`${name}: ${width}×${height}, ${Math.round(png.length / 1024)} KB`);
}
