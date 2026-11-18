// Test-only stand-in for the browser's canvas and decoder (never imported by the app).
import { vi } from "vitest";
import { displayedSize, readImageHeader } from "@/lib/output-check/imageHeader";
import { headerOnlyImage } from "./slideImageStandIn";

/**
 * Stubs `OffscreenCanvas` and `createImageBitmap` so the real slide image
 * preparer runs in Node on header-only images: a decode gives a bitmap of
 * the header's upright size, every pixel opaque, and an encode gives a
 * header-only image of the canvas's size, tagged with a count so no two
 * encodes give the same bytes. `wins` is the format the preparer's rule
 * picks, by the encoded sizes: a photo's (`jpeg`) or a flat graphic's (`png`).
 */
export function stubHeaderCanvas(wins: "jpeg" | "png"): void {
  let encodes = 0;
  class HeaderCanvas {
    constructor(
      public width: number,
      public height: number,
    ) {}
    getContext() {
      return {
        fillStyle: "",
        drawImage() {},
        fillRect() {},
        clearRect() {},
        getImageData: (_x: number, _y: number, w: number, h: number) => ({
          data: new Uint8ClampedArray(w * h * 4).fill(255),
        }),
      };
    }
    async convertToBlob({ type }: { type: string }) {
      const format = type === "image/png" ? "png" : "jpeg";
      const tag = new Uint8Array(format === wins ? 8 : 4000);
      new DataView(tag.buffer).setUint32(0, ++encodes);
      return new Blob([Uint8Array.from(headerOnlyImage(format, this, tag))]);
    }
  }
  vi.stubGlobal("OffscreenCanvas", HeaderCanvas);
  vi.stubGlobal("createImageBitmap", async (source: Blob) => {
    const header = readImageHeader(new Uint8Array(await source.arrayBuffer()));
    if (!header) throw new Error("not a picture");
    const [width, height] = displayedSize(header);
    return { width, height, close() {} };
  });
}
