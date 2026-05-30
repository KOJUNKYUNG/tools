import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { assemblePptxFromPlaced, type PlacedImage } from "./assemblePptx";
const PX = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC";
function placed(n: number): PlacedImage[] {
  return Array.from({ length: n }, () => ({ dataUrl: PX, placement: { x: 1, y: 1, w: 4, h: 3 } }));
}
describe("assemblePptxFromPlaced", () => {
  it("produces one slide per image", async () => {
    const bytes = await assemblePptxFromPlaced(placed(3), { slideKind: "16:9", background: { kind: "color", color: "FFFFFF" } });
    const zip = await JSZip.loadAsync(bytes);
    const slides = Object.keys(zip.files).filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p));
    expect(slides.length).toBe(3);
  });
  it("accepts an image background without throwing", async () => {
    const bytes = await assemblePptxFromPlaced(placed(1), { slideKind: "4:3", background: { kind: "image", dataUrl: PX } });
    expect(bytes.byteLength).toBeGreaterThan(0);
  });
});
