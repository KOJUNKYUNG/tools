import { randomBytes } from "node:crypto";
import JSZip from "jszip";
import PptxGenJS from "pptxgenjs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { zipCompressionMethods } from "@/lib/output-check/zipReader";
import { changeBackground } from "./changeBackground";

const BG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR4nGP8z8DwnwEJMJIoAACkrwMBhE8mKwAAAABJRU5ErkJggg==",
    "base64",
  ),
);

/**
 * A deck shaped like a PowerPoint save: every part deflated, plus one media
 * part that compresses well and one stored as-is (as some writers store
 * already-compressed images).
 */
async function deck(): Promise<Uint8Array> {
  const pptx = new PptxGenJS();
  for (let i = 1; i <= 2; i++) pptx.addSlide().addText(`Slide ${i}`, { x: 1, y: 1, w: 4, h: 1 });
  // write() returns a union over every outputType; "uint8array" yields this one.
  const zip = await JSZip.loadAsync(
    (await pptx.write({ outputType: "uint8array" })) as Uint8Array,
  );
  zip.file("ppt/media/flat.png", new Uint8Array(300_000));
  zip.file("ppt/media/noise.png", randomBytes(50_000), { compression: "STORE" });
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

// Node has no Image element; the engine only needs the image's size.
beforeAll(() => {
  vi.stubGlobal(
    "Image",
    class {
      naturalWidth = 2;
      naturalHeight = 2;
      onload: (() => void) | null = null;
      set src(_: string) {
        queueMicrotask(() => this.onload?.());
      }
    },
  );
});
afterAll(() => {
  vi.unstubAllGlobals();
});

describe("changeBackground keeps the deck's compression", () => {
  it("does not grow the deck beyond the new image and a few rewritten parts", async () => {
    const input = await deck();
    const output = await changeBackground({
      pptxFile: new File([new Uint8Array(input)], "deck.pptx"),
      bgImage: new File([BG], "bg.png"),
      mode: "all-slides",
    });

    expect(output.byteLength).toBeLessThan(input.byteLength + BG.byteLength + 4096);
  });

  it("stores every part the way the input stored it", async () => {
    const input = await deck();
    const output = await changeBackground({
      pptxFile: new File([new Uint8Array(input)], "deck.pptx"),
      bgImage: new File([BG], "bg.png"),
      mode: "all-slides",
    });

    const before = zipCompressionMethods(input)!;
    const after = zipCompressionMethods(output)!;
    expect(before.get("ppt/media/noise.png")).toBe("STORE");
    for (const [name, method] of before) expect([name, after.get(name)]).toEqual([name, method]);
  });
});
