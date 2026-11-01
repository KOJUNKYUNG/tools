import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { headerOnlyImage } from "./slideImageStandIn";
import { slideImagePreparer } from "./slideImage";

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
