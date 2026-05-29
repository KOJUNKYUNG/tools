import { describe, expect, it } from "vitest";
import { parseBlipRecords } from "./extractImagesFromPpt";

/**
 * Build a single BLIP record: 8-byte header (verInstance, recType, recLen)
 * followed by `recLen` bytes of body. The body is laid out as
 * 17 header bytes (BLIP_META[recType].headerSize for the formats we test)
 * then the raw image bytes.
 */
function buildBlipRecord(
  recType: number,
  imageBytes: number[],
  opts: { verInstance?: number; padHeader?: number } = {},
): Uint8Array {
  const verInstance = opts.verInstance ?? 0x0000;
  const padHeader = opts.padHeader ?? 17;
  const body = new Uint8Array(padHeader + imageBytes.length);
  body.set(imageBytes, padHeader);
  const out = new Uint8Array(8 + body.length);
  out[0] = verInstance & 0xff;
  out[1] = (verInstance >> 8) & 0xff;
  out[2] = recType & 0xff;
  out[3] = (recType >> 8) & 0xff;
  const recLen = body.length;
  out[4] = recLen & 0xff;
  out[5] = (recLen >> 8) & 0xff;
  out[6] = (recLen >> 16) & 0xff;
  out[7] = (recLen >> 24) & 0xff;
  out.set(body, 8);
  return out;
}

function concat(...chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

const JPG_MAGIC = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10];
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

describe("parseBlipRecords", () => {
  it("extracts a single JPG BLIP record", () => {
    const stream = buildBlipRecord(0xf01d, JPG_MAGIC);
    const images = parseBlipRecords(stream);
    expect(images).toHaveLength(1);
    expect(images[0].name).toBe("image_1.jpg");
    expect(images[0].mime).toBe("image/jpeg");
    expect(Array.from(images[0].data.slice(0, 3))).toEqual([0xff, 0xd8, 0xff]);
  });

  it("extracts and numbers multiple BLIPs of the same type", () => {
    const stream = concat(
      buildBlipRecord(0xf01d, JPG_MAGIC),
      buildBlipRecord(0xf01d, JPG_MAGIC),
      buildBlipRecord(0xf01e, PNG_MAGIC),
    );
    const images = parseBlipRecords(stream);
    expect(images).toHaveLength(3);
    expect(images.map((i) => i.name)).toEqual([
      "image_1.jpg",
      "image_2.jpg",
      "image_1.png",
    ]);
  });

  it("descends into container records (recVerInstance low nibble = 0xf)", () => {
    const inner = buildBlipRecord(0xf01e, PNG_MAGIC);
    const container = new Uint8Array(8 + inner.length);
    container[0] = 0x0f;
    container[1] = 0x00;
    container[2] = 0x00;
    container[3] = 0xf0;
    const innerLen = inner.length;
    container[4] = innerLen & 0xff;
    container[5] = (innerLen >> 8) & 0xff;
    container[6] = (innerLen >> 16) & 0xff;
    container[7] = (innerLen >> 24) & 0xff;
    container.set(inner, 8);
    const images = parseBlipRecords(container);
    expect(images).toHaveLength(1);
    expect(images[0].name).toBe("image_1.png");
  });

  it("stops on a record whose recLen would run past the buffer end", () => {
    const valid = buildBlipRecord(0xf01d, JPG_MAGIC);
    const truncated = new Uint8Array(8);
    truncated[2] = 0x1d;
    truncated[3] = 0xf0;
    truncated[4] = 0xff;
    truncated[5] = 0xff;
    truncated[6] = 0xff;
    truncated[7] = 0x7f;
    const stream = concat(valid, truncated);
    const images = parseBlipRecords(stream);
    expect(images).toHaveLength(1);
  });

  it("returns an empty array for an empty buffer", () => {
    expect(parseBlipRecords(new Uint8Array(0))).toEqual([]);
  });

  it("skips records with non-BLIP types and no container flag", () => {
    const noise = new Uint8Array(8 + 4);
    noise[2] = 0x10;
    noise[3] = 0x00;
    noise[4] = 4;
    const stream = concat(noise, buildBlipRecord(0xf01d, JPG_MAGIC));
    const images = parseBlipRecords(stream);
    expect(images).toHaveLength(1);
    expect(images[0].name).toBe("image_1.jpg");
  });

  it("skips a BLIP whose magic bytes are missing within the search window", () => {
    const bogus = new Array(50).fill(0x00);
    const stream = buildBlipRecord(0xf01d, bogus);
    const images = parseBlipRecords(stream);
    expect(images).toHaveLength(0);
  });
});
