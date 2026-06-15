import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { assemblePptxFromPlaced, type PlacedImage } from "./assemblePptx";
const PX = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC";
// Three distinct tiny PNGs so each contributes its own media entry (no incidental dedup).
const BG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR4nGNkYGD4z4AEGEkUAACk0gMB/9eeLwAAAABJRU5ErkJggg==";
const C1 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR4nGP8z8DwnwEJMJIoAACkrwMBhE8mKwAAAABJRU5ErkJggg==";
const C2 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR4nGNkYGD4z8DAwMgABYwkCgAAJK8DAdvgQ3UAAAAASUVORK5CYII=";
function placed(n: number): PlacedImage[] {
  return Array.from({ length: n }, () => ({ dataUrl: PX, placement: { x: 1, y: 1, w: 4, h: 3 } }));
}
function mediaEntries(zip: JSZip): string[] {
  return Object.keys(zip.files).filter((p) => /^ppt\/media\/.+/.test(p));
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

  it("stores a shared image background only once across slides", async () => {
    const images: PlacedImage[] = [C1, C2].map((dataUrl) => ({
      dataUrl,
      placement: { x: 1, y: 1, w: 4, h: 3 },
    }));
    const bytes = await assemblePptxFromPlaced(images, {
      slideKind: "16:9",
      background: { kind: "image", dataUrl: BG },
    });
    const zip = await JSZip.loadAsync(bytes);
    // Two distinct content images + ONE shared background = 3 media entries.
    // Per-slide backgrounds would duplicate the background to 4.
    expect(mediaEntries(zip).length).toBe(images.length + 1);
  });
});
