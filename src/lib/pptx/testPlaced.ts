// Test-only helper for image-to-pptx's checker (never imported by the app).
import type { PlacedImage } from "./assemblePptx";

/** The checker's view of a run: the images as embedded, in slide order (placement is not checked). */
export const placedAs = (dataUrls: string[]): PlacedImage[] =>
  dataUrls.map((dataUrl) => ({ dataUrl, placement: { x: 0, y: 0, w: 0, h: 0 } }));
