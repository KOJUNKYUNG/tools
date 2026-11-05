import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JPEG_3x2, solidPng, withExifOrientation, withJpegSize, withPngExif } from "@/lib/pdf/testImages";
import { headerOnlyImage } from "./slideImageStandIn";
import { sizedImagePreparer, slideImagePreparer, uprightSize } from "./slideImage";

const WIDE = { w: 12192000, h: 6858000 }; // 16:9

/**
 * A stand-in canvas: a drawing only carries over the source's `alpha`, every
 * pixel reads back at that alpha, and it encodes as `<format>:<name>`, a
 * JPEG a tenth of its PNG (a photo's sizes), so the bytes name the canvas
 * that was encoded.
 */
class FakeCanvas {
  name = "fitted";
  alpha = 255;
  constructor(
    public width: number,
    public height: number,
  ) {}
  getContext() {
    return {
      drawImage: (source: { alpha?: number }) => {
        this.alpha = source.alpha ?? 255;
      },
      clearRect() {},
      getImageData: (_x: number, _y: number, w: number, h: number) => ({
        data: new Uint8ClampedArray(w * h * 4).fill(this.alpha),
      }),
    };
  }
  async convertToBlob({ type }: { type: string }) {
    const format = type.slice("image/".length);
    return new Blob([`${format}:${this.name}`.padEnd(format === "png" ? 100 : 10)]);
  }
}

// The stubbed global makes every OffscreenCanvas the preparer sees a FakeCanvas.
const fake = (canvas: OffscreenCanvas) => canvas as unknown as FakeCanvas;

const bitmap = (width: number, height: number) => ({ width, height, close() {} });

/** A JPEG file the preparer reads the header of; the stubbed decoder gives its pixels. */
const jpegFile = (width: number, height: number, tag: number) =>
  new Blob([Uint8Array.from(headerOnlyImage("jpeg", { width, height }, new Uint8Array([tag])))]);

const fileOf = (bytes: Uint8Array) => new Blob([Uint8Array.from(bytes)]);

const decoded = (bytes: Uint8Array) => new TextDecoder().decode(bytes).trim();

describe("slideImagePreparer", () => {
  beforeEach(() => {
    vi.stubGlobal("OffscreenCanvas", FakeCanvas);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("hands the step the picture fitted inside 4K and encodes what the step returns", async () => {
    vi.stubGlobal("createImageBitmap", async () => bitmap(8000, 4500));
    const source = jpegFile(8000, 4500, 1);
    const seen: { width: number; height: number }[] = [];
    const prepare = slideImagePreparer((fitted) => {
      seen.push({ width: fitted.width, height: fitted.height });
      const out = new OffscreenCanvas(fitted.width, fitted.height);
      fake(out).name = "stepped";
      return out;
    });

    const prepared = await prepare(source, { x: 0, y: 0, width: 8000, height: 4500 }, WIDE);

    expect(seen).toEqual([{ width: 3840, height: 2160 }]);
    expect(decoded(prepared.bytes)).toBe("jpeg:stepped");
    expect(prepared).toMatchObject({ format: "jpeg", width: 3840, height: 2160 });
  });

  it("runs the step on a JPEG taken whole at its own size, which goes in as uploaded without one", async () => {
    vi.stubGlobal("createImageBitmap", async () => bitmap(1920, 1080));
    const file = jpegFile(1920, 1080, 2);
    const whole = { x: 0, y: 0, width: 1920, height: 1080 };
    const named = (fitted: OffscreenCanvas) => {
      fake(fitted).name = "stepped";
      return fitted;
    };

    const plain = await slideImagePreparer()(file, whole, WIDE);
    const stepped = await slideImagePreparer(named)(file, whole, WIDE);

    expect(plain.bytes).toEqual(new Uint8Array(await file.arrayBuffer()));
    expect(decoded(stepped.bytes)).toBe("jpeg:stepped");
  });

  it("keeps the step's picture PNG when it comes out with transparency", async () => {
    vi.stubGlobal("createImageBitmap", async () => bitmap(1920, 1080));
    const source = jpegFile(1920, 1080, 3);
    const prepare = slideImagePreparer((fitted) => {
      Object.assign(fake(fitted), { name: "see-through", alpha: 128 });
      return fitted;
    });

    const prepared = await prepare(source, { x: 0, y: 0, width: 1920, height: 1080 }, WIDE);

    expect(decoded(prepared.bytes)).toBe("png:see-through");
    expect(prepared.format).toBe("png");
  });
});

describe("sizedImagePreparer", () => {
  beforeEach(() => {
    vi.stubGlobal("OffscreenCanvas", FakeCanvas);
  });
  afterEach(() => vi.unstubAllGlobals());

  const whole = (width: number, height: number) => ({ x: 0, y: 0, width, height });
  const size = (width: number, height: number) => ({ width, height });

  it("draws at the size the caller gives, whatever the picture's shape", async () => {
    vi.stubGlobal("createImageBitmap", async () => bitmap(3024, 4032));

    const prepared = await sizedImagePreparer()(jpegFile(3024, 4032, 4), whole(3024, 4032), size(810, 1080));

    expect(prepared).toMatchObject({ format: "jpeg", width: 810, height: 1080 });
    expect(decoded(prepared.bytes)).toBe("jpeg:fitted");
  });

  it("puts a JPEG that fits in as uploaded, byte for byte", async () => {
    vi.stubGlobal("createImageBitmap", async () => bitmap(800, 600));
    const file = jpegFile(800, 600, 5);

    const prepared = await sizedImagePreparer()(file, whole(800, 600), size(800, 600));

    expect(prepared.bytes).toEqual(new Uint8Array(await file.arrayBuffer()));
    expect(prepared.format).toBe("jpeg");
  });

  it("re-encodes a JPEG that needs turning, though it fits", async () => {
    vi.stubGlobal("createImageBitmap", async () => bitmap(4, 6));
    // Stored 6 × 4, shown 4 × 6.
    const sideways = withExifOrientation(withJpegSize(JPEG_3x2, 6, 4), 6);

    const prepared = await sizedImagePreparer()(fileOf(sideways), whole(4, 6), size(4, 6));

    expect(prepared.bytes).not.toEqual(sideways);
    expect(decoded(prepared.bytes)).toBe("jpeg:fitted");
  });

  it("refuses a JPEG that fits but does not decode, rather than putting it in", async () => {
    vi.stubGlobal("createImageBitmap", async () => {
      throw new DOMException("The source image could not be decoded.", "InvalidStateError");
    });

    await expect(
      sizedImagePreparer()(jpegFile(800, 600, 6), whole(800, 600), size(800, 600)),
    ).rejects.toThrow(/^INVALID_INPUT/);
  });

  it("puts a PNG that fits in as uploaded when its transparency is used", async () => {
    vi.stubGlobal("createImageBitmap", async () => ({ ...bitmap(40, 30), alpha: 128 }));
    const png = headerOnlyImage("png", size(40, 30), new Uint8Array([7]));

    const prepared = await sizedImagePreparer()(fileOf(png), whole(40, 30), size(40, 30));

    expect(prepared.bytes).toEqual(png);
    expect(prepared.format).toBe("png");
  });

  it("turns an opaque PNG that fits into JPEG when that is at most half its PNG", async () => {
    vi.stubGlobal("createImageBitmap", async () => bitmap(40, 30));
    const png = headerOnlyImage("png", size(40, 30), new Uint8Array([8]));

    const prepared = await sizedImagePreparer()(fileOf(png), whole(40, 30), size(40, 30));

    expect(decoded(prepared.bytes)).toBe("jpeg:fitted");
    expect(prepared.format).toBe("jpeg");
  });

  it("keeps an opaque PNG that fits as uploaded when JPEG would not halve it", async () => {
    // A form or text page: the JPEG here is as large as the PNG.
    class FlatCanvas extends FakeCanvas {
      override async convertToBlob({ type }: { type: string }) {
        return new Blob([`${type}:${this.name}`.padEnd(100)]);
      }
    }
    vi.stubGlobal("OffscreenCanvas", FlatCanvas);
    vi.stubGlobal("createImageBitmap", async () => bitmap(40, 30));
    const png = headerOnlyImage("png", size(40, 30), new Uint8Array([9]));

    const prepared = await sizedImagePreparer()(fileOf(png), whole(40, 30), size(40, 30));

    expect(prepared.bytes).toEqual(png);
    expect(prepared.format).toBe("png");
  });

  it("saves a resized PNG whose transparency is used as PNG", async () => {
    vi.stubGlobal("createImageBitmap", async () => ({ ...bitmap(4000, 3000), alpha: 128 }));
    const png = headerOnlyImage("png", size(4000, 3000), new Uint8Array([10]));

    const prepared = await sizedImagePreparer()(fileOf(png), whole(4000, 3000), size(1440, 1080));

    expect(prepared).toMatchObject({ format: "png", width: 1440, height: 1080 });
    expect(decoded(prepared.bytes)).toBe("png:fitted");
  });
});

describe("uprightSize", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads a picture's size from its header, without decoding it", async () => {
    vi.stubGlobal("createImageBitmap", async () => {
      throw new Error("decoded");
    });
    expect(await uprightSize(jpegFile(800, 600, 11))).toEqual({ width: 800, height: 600 });
  });

  it("swaps the sides of a JPEG shown a quarter turned", async () => {
    const sideways = withExifOrientation(withJpegSize(JPEG_3x2, 4032, 3024), 6);
    expect(await uprightSize(fileOf(sideways))).toEqual({ width: 3024, height: 4032 });
  });

  it("asks the decoder when the header cannot say how the picture shows", async () => {
    vi.stubGlobal("createImageBitmap", async () => bitmap(30, 40));
    const turned = withPngExif(solidPng(40, 30));
    expect(await uprightSize(fileOf(turned))).toEqual({ width: 30, height: 40 });
  });

  it("calls a picture nothing can read the file's problem", async () => {
    vi.stubGlobal("createImageBitmap", async () => {
      throw new DOMException("The source image could not be decoded.", "InvalidStateError");
    });
    await expect(uprightSize(new Blob(["not a picture"]))).rejects.toThrow(/^INVALID_INPUT/);
  });
});
